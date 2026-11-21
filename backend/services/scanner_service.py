# -*- coding: utf-8 -*-
"""
services/scanner_service.py —— URL 安全检测业务逻辑
====================================================

📝 这个模块是整个平台最有"安全审计"味道的部分！
   根据你的设计图，后端做 3 件事：
   1. 检查 HTTP 安全响应头
   2. 检查 SSL 证书
   3. 检查常见端口开放情况
   
   最后给出安全评分和改进建议。

🔧 用到的现成库：
   - requests: 发 HTTP 请求
   - ssl + socket: 检查 SSL 证书和端口
"""

import json
import socket
import ssl
import uuid
from urllib.parse import urlparse
from datetime import datetime  # 新增：检测结果里要返回 created_at

try:
    import requests
except ImportError:
    requests = None

try:
    from OpenSSL import crypto
except ImportError:
    crypto = None

from utils.db import db
from models import Report


# 重要的 HTTP 安全响应头
# 参考：https://developer.mozilla.org/zh-CN/docs/Web/Security/Headers
SECURITY_HEADERS = {
    "Strict-Transport-Security": {
        "name": "HSTS",
        "desc": "强制使用 HTTPS 加密传输",
        "penalty": 10,  # 缺失扣多少分
    },
    "X-Frame-Options": {
        "name": "X-Frame-Options",
        "desc": "防止页面被 iframe 嵌入（防点击劫持）",
        "penalty": 10,
    },
    "X-Content-Type-Options": {
        "name": "X-Content-Type-Options",
        "desc": "防止 MIME 类型嗅探",
        "penalty": 5,
    },
    "Content-Security-Policy": {
        "name": "CSP",
        "desc": "内容安全策略，限制页面可以加载哪些资源",
        "penalty": 15,
    },
    "Referrer-Policy": {
        "name": "Referrer-Policy",
        "desc": "控制 Referer 头的发送",
        "penalty": 5,
    },
}


def check_http_headers(url: str):
    """
    检查 HTTP 安全响应头
    
    返回: (检测结果 dict, 扣分 int)
    """
    result = {}
    penalty = 0

    if requests is None:
        return {"error": "requests 库未安装"}, 0

    try:
        # 发请求，允许重定向，设置超时
        resp = requests.get(url, timeout=10, allow_redirects=True)
        headers = resp.headers

        for header_key, info in SECURITY_HEADERS.items():
            value = headers.get(header_key)
            if value:
                result[info["name"]] = {
                    "status": "✅ 已设置",
                    "value": value[:100] + "..." if len(value) > 100 else value,
                    "desc": info["desc"],
                }
            else:
                result[info["name"]] = {
                    "status": "❌ 缺失",
                    "value": None,
                    "desc": info["desc"],
                    "suggestion": f"建议添加 {header_key} 响应头",
                }
                penalty += info["penalty"]

    except requests.exceptions.SSLError as e:
        result["_error"] = f"SSL 证书错误: {str(e)[:80]}"
        penalty += 15
    except requests.exceptions.ConnectionError:
        result["_error"] = "无法连接到目标网站"
        penalty += 30
    except requests.exceptions.Timeout:
        result["_error"] = "请求超时"
        penalty += 20
    except Exception as e:
        result["_error"] = f"请求失败: {str(e)[:80]}"
        penalty += 20

    return result, penalty


def check_ssl_certificate(url: str):
    """
    检查 SSL 证书信息
    
    返回: (检测结果 dict, 扣分 int)
    """
    result = {}
    penalty = 0

    # 解析 URL，提取 hostname 和 port
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        port = parsed.port or 443

        if not hostname:
            return {"error": "无法解析域名"}, 0

        # 只检查 HTTPS 的证书
        if parsed.scheme != "https":
            result = {
                "status": "⚠️ 非 HTTPS",
                "info": "目标网站使用 HTTP，没有 SSL 加密",
                "suggestion": "强烈建议升级到 HTTPS",
            }
            penalty += 30
            return result, penalty

        # 连接并获取证书
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                
                # 提取关键信息
                subject = dict(x[0] for x in cert.get("subject", []))
                issuer = dict(x[0] for x in cert.get("issuer", []))
                
                result = {
                    "status": "✅ 证书正常",
                    "subject": subject.get("commonName", "未知"),
                    "issuer": issuer.get("commonName", "未知"),
                    "not_before": cert.get("notBefore", "未知"),
                    "not_after": cert.get("notAfter", "未知"),
                    "version": cert.get("version", "未知"),
                }

    except ssl.SSLCertVerificationError as e:
        result = {
            "status": "❌ 证书验证失败",
            "info": str(e)[:100],
            "suggestion": "证书可能已过期、域名不匹配或不受信任",
        }
        penalty += 25
    except ConnectionRefusedError:
        result = {"status": "❌ 连接被拒绝", "info": "端口未开放"}
        penalty += 20
    except Exception as e:
        result = {"status": "⚠️ 检测失败", "info": str(e)[:100]}
        penalty += 10

    return result, penalty


def check_ports(url: str):
    """
    检查常见端口开放情况（快速扫描，只扫几个默认端口）
    
    为什么只扫几个端口？
    —— 这是给小白用的轻量工具，不能当黑客工具用。
       只扫最常见的：80(HTTP), 443(HTTPS), 22(SSH), 21(FTP), 3306(MySQL)
    
    返回: (检测结果 dict, 扣分 int)
    """
    result = {}
    penalty = 0
    common_ports = {
        80: "HTTP",
        443: "HTTPS",
        22: "SSH",
        21: "FTP",
        3306: "MySQL",
    }

    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return {}, 0

        for port, name in common_ports.items():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)  # 每个端口只等 2 秒
                conn_result = sock.connect_ex((hostname, port))
                sock.close()

                if conn_result == 0:
                    result[str(port)] = {
                        "name": name,
                        "status": "🔓 开放",
                        "risk": "高" if port in [21, 22, 3306] else "低",
                    }
                    # 危险端口开放扣分
                    if port in [21, 3306]:  # FTP 和 MySQL 裸露在外很危险
                        penalty += 10
                else:
                    result[str(port)] = {
                        "name": name,
                        "status": "🔒 关闭",
                    }

            except Exception:
                result[str(port)] = {
                    "name": name,
                    "status": "❓ 检测失败",
                }

    except Exception as e:
        result["_error"] = str(e)[:80]

    return result, penalty


def scan_url(url: str, user_id: int = None):
    """
    完整的 URL 安全检测（整合上面三个子检查）
    
    参数:
        url: 要检测的网址
        user_id: 用户 ID（可选，没登录就不存）
    
    返回: (是否成功, 检测结果 dict)
    """
    # 1. 预处理 URL
    url = url.strip()
    if not url:
        return False, "请输入网址"
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    # 2. 执行三项检测
    headers_result, headers_penalty = check_http_headers(url)
    ssl_result, ssl_penalty = check_ssl_certificate(url)
    ports_result, ports_penalty = check_ports(url)

    # 3. 计算评分（满分 100，扣分制）
    score = 100 - headers_penalty - ssl_penalty - ports_penalty
    score = max(0, min(100, score))  # 限制在 0-100 之间

    # 4. 组装结果
    full_result = {
        "report_no": None,  # 登录保存后才会有值
        "url": url,
        "score": score,
        "grade": _score_to_grade(score),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "details": {
            "http_headers": headers_result,
            "ssl_certificate": ssl_result,
            "ports": ports_result,
        },
        "suggestions": _generate_suggestions(headers_result, ssl_result, ports_result),
    }

    # 5. 保存到历史（如果有 user_id）
    if user_id:
        try:
            report = Report(
                report_no=uuid.uuid4().hex[:16],  # 对外编号，不暴露自增 id
                user_id=user_id,
                report_type="url",
                url=url,
                score=score,
                grade=full_result["grade"],
                details=json.dumps(full_result["details"], ensure_ascii=False),
                suggestions=json.dumps(full_result["suggestions"], ensure_ascii=False),
            )
            db.session.add(report)
            db.session.commit()
            full_result["report_no"] = report.report_no
        except Exception:
            db.session.rollback()  # 保存失败不影响检测结果返回

    return True, full_result


def _score_to_grade(score: int) -> str:
    """把数字评分转成等级"""
    if score >= 90:
        return "A 优秀"
    elif score >= 75:
        return "B 良好"
    elif score >= 60:
        return "C 及格"
    elif score >= 40:
        return "D 较差"
    else:
        return "F 危险"


def _generate_suggestions(headers, ssl_info, ports):
    """
    根据检测结果生成改进建议列表
    """
    suggestions = []

    # 响应头建议
    if "error" not in headers:
        for name, info in headers.items():
            if info.get("suggestion"):
                suggestions.append(info["suggestion"])

    # SSL 建议
    if ssl_info.get("suggestion"):
        suggestions.append(ssl_info["suggestion"])

    # 端口建议
    if ports:
        for port, info in ports.items():
            if info.get("risk") == "高" and info.get("status") == "🔓 开放":
                suggestions.append(f"端口 {port} ({info['name']}) 对外暴露，建议在内网或通过防火墙限制")

    if not suggestions:
        suggestions.append("✅ 未发现明显安全问题，继续保持！")

    return suggestions


def get_scan_history(user_id: int, page: int = 1, pagesize: int = 10):
    """分页获取某个用户的检测历史，返回 (记录列表, 总条数)"""
    # 只取 URL 检测报告，避免把文件审计报告混进 URL 检测历史
    query = Report.query.filter_by(user_id=user_id, report_type="url")
    total = query.count()
    records = (
        query.order_by(Report.created_at.desc(), Report.id.desc())
        .offset((page - 1) * pagesize)
        .limit(pagesize)
        .all()
    )
    return [r.to_dict() for r in records], total
