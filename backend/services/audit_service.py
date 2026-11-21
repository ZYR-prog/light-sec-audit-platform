# -*- coding: utf-8 -*-
"""
services/audit_service.py —— 审计日志服务
==========================================

📌 这里只做三件事：
1. 写日志（唯一入口，统一脱敏，防止有人随手把密码写进去）
2. 查日志（分页 + 条件筛选，绝不全量返回）
3. 清理/归档日志（只给离线命令用，应用层不开放接口）

📌 为什么不给"删除日志"的接口？
—— 审计日志的价值在于"不可篡改"。
   如果能从网页上删，那它就失去了作为证据的意义。
   真要清理，只能在服务器上用 manage.py 执行，并且先归档。

📌 为什么日志会越来越大，怎么治？
—— 这是审计系统的通病，无法避免，只能控制：
   1. 只记录"关键动作"，不记 GET 查询、健康检查这种噪音
   2. detail 字段限长，避免写成大文本仓库
   3. 时间字段建索引，查询永远带分页
   4. 定期归档（导出 CSV）后删除过期数据，再 VACUUM 回收磁盘
"""

import csv
import json
import os
from datetime import datetime, timedelta

from flask import has_request_context, request
from sqlalchemy import or_

from config import config
from models import AuditLog
from utils.db import db
from utils.helpers import get_client_ip, get_request_id


# 允许记录的动作白名单。
# 加新动作时先在这里登记，好处是：日志里的 action 永远是有限枚举，
# 不会出现 "login"/"Login"/"LOGIN " 这种五花八门的写法。
ACTIONS = {
    "REGISTER": "用户注册",
    "LOGIN": "用户登录",
    "LOGIN_FAIL": "登录失败",
    "CREATE_REPORT": "生成检测报告",
    "UPDATE_REPORT": "更新检测报告",
    "DELETE_REPORT": "删除检测报告",
}

# 敏感字段关键词：命中这些的字段一律不写进日志
SENSITIVE_KEYWORDS = (
    "password", "passwd", "pwd", "token", "secret",
    "authorization", "cookie", "session", "credit", "id_card",
)

# detail 里允许出现的字段（白名单）。
# 白名单比黑名单安全：以后业务新增了敏感参数，不会被"默认写进去"。
ALLOWED_DETAIL_KEYS = {
    "username", "role", "report_no", "host", "path", "score", "grade", "reason",
    # 文件审计报告相关
    "file_name", "total", "high", "mid", "low",
}


def _mask_value(key: str, value):
    """对单个字段做脱敏处理"""
    lowered = key.lower()
    if any(word in lowered for word in SENSITIVE_KEYWORDS):
        return None  # 直接丢弃，不写"***"，避免误以为存了真实值
    text = "" if value is None else str(value)
    if len(text) > 200:
        text = text[:200] + "..."
    return text


def _sanitize_detail(detail):
    """
    把 detail 字典处理成安全、限长的 JSON 字符串。

    规则：
    - 只保留白名单字段
    - 敏感字段丢弃
    - 单值最长 200 字，整体最长 AUDIT_MAX_DETAIL_LENGTH
    """
    if not detail:
        return None
    safe = {}
    for key, value in detail.items():
        if key not in ALLOWED_DETAIL_KEYS:
            continue
        masked = _mask_value(key, value)
        if masked is not None:
            safe[key] = masked
    if not safe:
        return None
    text = json.dumps(safe, ensure_ascii=False)
    limit = config["default"].AUDIT_MAX_DETAIL_LENGTH
    return text[:limit]


def safe_url(url: str) -> str:
    """
    去掉 URL 的查询串和锚点，只留协议+域名+路径。

    为什么要这么做？
    —— 很多网站的链接里带 ?token=xxx&session=yyy，
       直接记进日志等于把别人的凭证抄了一份。
    """
    if not url:
        return ""
    base = url.split("#", 1)[0].split("?", 1)[0]
    return base[:500]


def write_log(
    action: str,
    operator_id=None,
    operator_name="游客",
    target_type="",
    target_id=None,
    detail=None,
    result="SUCCESS",
    error_code=None,
    message=None,
):
    """
    写一条审计日志（全项目唯一的写入口）。

    ⚠️ 调用时机：请务必在业务数据 commit 之后调用。
       否则一旦写日志失败触发 rollback，会把还没提交的业务数据一起回滚掉。

    ⚠️ 异常策略：写日志失败不能影响用户正常使用，
       所以这里吞掉异常，只在控制台打出来。
    """
    if action not in ACTIONS:
        # 防止写进未登记的动作，保证枚举干净
        print(f"[审计警告] 未登记的动作：{action}")
        return

    try:
        log = AuditLog(
            request_id=get_request_id() if has_request_context() else None,
            operator_id=operator_id,
            operator_name=(operator_name or "游客")[:64],
            action=action,
            target_type=(target_type or "")[:32],
            target_id=str(target_id)[:64] if target_id is not None else None,
            detail=_sanitize_detail(detail),
            result=result if result in ("SUCCESS", "FAIL") else "FAIL",
            error_code=error_code,
            message=(message or "")[:200] or None,
            ip=get_client_ip() if has_request_context() else None,
            user_agent=(
                request.headers.get("User-Agent", "")[:255]
                if has_request_context()
                else None
            ),
        )
        db.session.add(log)
        db.session.commit()
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        print(f"[审计警告] 日志写入失败：{exc}")


def query_logs(page=1, pagesize=10, action=None, operator=None, result=None,
               start_time=None, end_time=None, keyword=None):
    """
    分页查询审计日志（给管理员用）。

    返回 (list, total, page, pagesize)
    """
    query = AuditLog.query

    if action:
        query = query.filter(AuditLog.action == action)
    if result:
        query = query.filter(AuditLog.result == result)
    if operator:
        query = query.filter(
            AuditLog.operator_name.like(f"%{_escape_like(operator)}%", escape="\\")
        )
    if start_time:
        query = query.filter(AuditLog.created_at >= start_time)
    if end_time:
        query = query.filter(AuditLog.created_at <= end_time)
    if keyword:
        # 只在 message 和 detail 里搜，避免全表扫太多字段
        pattern = f"%{_escape_like(keyword)}%"
        query = query.filter(
            or_(
                AuditLog.message.like(pattern, escape="\\"),
                AuditLog.detail.like(pattern, escape="\\"),
            )
        )

    total = query.count()
    rows = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * pagesize)
        .limit(pagesize)
        .all()
    )
    return [r.to_dict() for r in rows], total


def _escape_like(text: str) -> str:
    """
    转义 LIKE 的通配符。

    如果不转义，用户输入 "%" 就会匹配所有记录；
    更糟的是拼出能拖慢数据库的模糊查询。
    配合 SQLAlchemy 的参数化查询，这里只处理通配符，不存在 SQL 注入。
    """
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def cleanup(days=None, archive_path=None):
    """
    删除过期日志（只供 manage.py 调用，不暴露成接口）。

    参数：
        days         保留天数，默认取配置 AUDIT_RETENTION_DAYS
        archive_path 归档 CSV 路径；给了就先导出再删除

    返回：删除条数
    """
    days = days or config["default"].AUDIT_RETENTION_DAYS
    deadline = datetime.now() - timedelta(days=days)

    old_rows = AuditLog.query.filter(AuditLog.created_at < deadline).all()
    if not old_rows:
        return 0

    if archive_path:
        os.makedirs(os.path.dirname(archive_path) or ".", exist_ok=True)
        with open(archive_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow([
                "log_id", "request_id", "operator_id", "operator_name", "action",
                "target_type", "target_id", "detail", "result", "error_code",
                "message", "ip", "user_agent", "created_at",
            ])
            for row in old_rows:
                writer.writerow([
                    row.id, row.request_id, row.operator_id, row.operator_name,
                    row.action, row.target_type, row.target_id, row.detail,
                    row.result, row.error_code, row.message, row.ip,
                    row.user_agent, row.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                ])

    count = AuditLog.query.filter(AuditLog.created_at < deadline).delete(
        synchronize_session=False
    )
    db.session.commit()

    # 删除后空间不会自动还给操作系统，需要 VACUUM（manage.py 里执行）
    return count


def stats():
    """给管理员看的日志概况：总数、最早/最新时间"""
    total = AuditLog.query.count()
    first = AuditLog.query.order_by(AuditLog.created_at.asc()).first()
    last = AuditLog.query.order_by(AuditLog.created_at.desc()).first()
    return {
        "total": total,
        "earliest": first.created_at.strftime("%Y-%m-%d %H:%M:%S") if first else None,
        "latest": last.created_at.strftime("%Y-%m-%d %H:%M:%S") if last else None,
    }
