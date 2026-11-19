# -*- coding: utf-8 -*-
"""
services/report_service.py —— 文件审计报告业务逻辑
====================================================

负责把前端 scan.js 产出的 ScanResult 存进 reports 表：

    {
        "vul_list": [...],
        "stat": {"high": 1, "mid": 2, "low": 0, "total": 3},
        "scan_meta": {"file_name": "...", ...}
    }

📌 旧 progress_service.py 已删除：
   旧版存的是"学习进度（测验名称/分数）"，和本平台无关；
   本文件存的是"审计过的文件 + 漏洞结果"，对应功能2。

📌 数据量控制：
   - 单次最多 2000 条漏洞，detail 最大 2MB，避免把 SQLite 写成大文件仓库；
   - 列表接口只返回摘要，不返回 vul_list；
   - 详情接口才返回完整 vul_list / scan_meta。
"""

import json
import uuid

from models import Report
from services.audit_service import write_log
from utils.db import db

# 单次报告允许的最大漏洞条数
MAX_VUL_ITEMS = 2000

# 单份报告 details 的最大字节数（约 2MB）
MAX_DETAIL_BYTES = 2 * 1024 * 1024

# 合法风险等级，与 js/core/data-schema.js 的 LEVEL 保持一致
VALID_LEVELS = ("高危", "中危", "低危")

# 每条漏洞必须具备的字段，与 data-schema.js 的 VUL_FIELDS 保持一致
REQUIRED_VUL_FIELDS = (
    "vid", "vname", "level", "line",
    "hit_content", "description", "suggestion", "file_name",
)


def _error(field: str, message: str):
    return {"field": field, "message": message}


def _validate_stat(raw):
    """校验 stat，返回 (清洗后的 stat, 错误列表)"""
    if not isinstance(raw, dict):
        return None, [_error("stat", "stat 必须是对象")]

    errors = []
    values = {}
    for key in ("high", "mid", "low", "total"):
        value = raw.get(key)
        # bool 是 int 的子类，必须单独排除，否则 True 会被当成 1
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            errors.append(_error(f"stat.{key}", f"stat.{key} 必须是非负整数"))
        else:
            values[key] = value

    if not errors and values["high"] + values["mid"] + values["low"] != values["total"]:
        errors.append(_error("stat", "high + mid + low 必须等于 total"))

    return (values if not errors else None), errors


def _normalize_vul_list(raw):
    """逐条清洗漏洞数据，返回 (清洗后的数组, 错误列表)"""
    if not isinstance(raw, list):
        return None, [_error("vul_list", "vul_list 必须是数组")]
    if len(raw) > MAX_VUL_ITEMS:
        return None, [_error("vul_list", f"单次最多保存 {MAX_VUL_ITEMS} 条漏洞")]

    cleaned = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            return None, [_error(f"vul_list[{index}]", "必须是对象")]

        missing = [f for f in REQUIRED_VUL_FIELDS if f not in item]
        if missing:
            return None, [_error(
                f"vul_list[{index}]", "缺少字段：" + "、".join(missing)
            )]

        if item["level"] not in VALID_LEVELS:
            return None, [_error(
                f"vul_list[{index}].level", "风险等级只能是 高危/中危/低危"
            )]

        try:
            line = int(item["line"])
        except (TypeError, ValueError):
            line = 0
        if line < 1:
            return None, [_error(f"vul_list[{index}].line", "line 必须是正整数")]

        cleaned.append({
            "vid": str(item["vid"])[:32],
            "vname": str(item["vname"])[:128],
            "level": item["level"],
            "line": line,
            "hit_content": str(item["hit_content"])[:200],
            "description": str(item["description"])[:1000],
            "suggestion": str(item["suggestion"])[:1000],
            "file_name": str(item["file_name"])[:255],
        })

    return cleaned, []


def _derive_suggestions(vul_list):
    """从漏洞明细里去重提取修复建议，避免前端重复传一遍"""
    seen = set()
    suggestions = []
    for item in vul_list:
        text = item["suggestion"].strip()
        if text and text not in seen:
            seen.add(text)
            suggestions.append(text)
    return suggestions


def save_file_report(user_id: int, operator_name: str, payload: dict):
    """
    保存一份文件审计报告。

    返回：(是否成功, 数据或提示, HTTP 状态码, 字段错误列表)
    """
    errors = []

    # scan_meta 先取出来，file_name 允许从 scan_meta.file_name 兜底，
    # 这样前端可以直接把 scan.js 的 ScanResult 传过来，不用再拆一遍字段。
    scan_meta = payload.get("scan_meta")

    # ---------- 1. 文件名 ----------
    file_name = str(payload.get("file_name") or "").strip()
    if not file_name and isinstance(scan_meta, dict):
        file_name = str(scan_meta.get("file_name") or "").strip()
    if not file_name:
        errors.append(_error("file_name", "file_name 不能为空"))
    elif len(file_name) > 255:
        errors.append(_error("file_name", "file_name 最长 255 个字符"))

    # ---------- 2. 统计 ----------
    stat, stat_errors = _validate_stat(payload.get("stat"))
    errors.extend(stat_errors)

    # ---------- 3. 漏洞明细 ----------
    vul_list, vul_errors = _normalize_vul_list(payload.get("vul_list"))
    errors.extend(vul_errors)

    if stat and vul_list is not None and stat["total"] != len(vul_list):
        errors.append(_error("stat.total", "total 必须等于 vul_list 的条数"))

    # ---------- 4. 扫描元信息 ----------
    scan_meta = payload.get("scan_meta")
    if scan_meta is not None and not isinstance(scan_meta, dict):
        errors.append(_error("scan_meta", "scan_meta 必须是对象"))

    # ---------- 5. 建议（可选，不传就自动从漏洞明细里提取） ----------
    suggestions = payload.get("suggestions")
    if suggestions is not None:
        if not isinstance(suggestions, list):
            errors.append(_error("suggestions", "suggestions 必须是数组"))
        elif len(suggestions) > 50:
            errors.append(_error("suggestions", "suggestions 最多 50 条"))
        elif any(not isinstance(s, str) for s in suggestions):
            errors.append(_error("suggestions", "suggestions 每一项必须是字符串"))

    if errors:
        return False, "参数校验失败", 400, errors

    if suggestions is None:
        suggestions = _derive_suggestions(vul_list)
    else:
        suggestions = [s.strip()[:500] for s in suggestions if s.strip()]

    # ---------- 6. 组装并限制体积 ----------
    details_text = json.dumps(
        {"vul_list": vul_list, "scan_meta": scan_meta or {}},
        ensure_ascii=False,
    )
    if len(details_text.encode("utf-8")) > MAX_DETAIL_BYTES:
        return False, "参数校验失败", 400, [
            _error("vul_list", "单次报告内容过大，请拆分后再保存")
        ]

    report = Report(
        report_no=uuid.uuid4().hex[:16],  # 对外编号，不暴露自增 id
        user_id=user_id,
        report_type="file",
        file_name=file_name,
        stat=json.dumps(stat, ensure_ascii=False),
        details=details_text,
        suggestions=json.dumps(suggestions, ensure_ascii=False),
    )

    try:
        db.session.add(report)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return False, "保存失败，请稍后重试", 500, None

    # 业务数据提交成功后再写审计日志（这是关键动作，不算噪音）
    write_log(
        action="CREATE_REPORT",
        operator_id=user_id,
        operator_name=operator_name,
        target_type="report",
        target_id=report.report_no,
        detail={"file_name": file_name, "total": stat["total"]},
        result="SUCCESS",
        message="保存文件审计报告",
    )

    return True, report.to_dict(), 200, None


def list_reports(user_id: int, page: int, pagesize: int, report_type: str = None):
    """
    分页查询某个用户的报告历史（只查自己的）。

    返回：(摘要列表, 总条数)
    """
    query = Report.query.filter_by(user_id=user_id)
    if report_type:
        query = query.filter_by(report_type=report_type)

    total = query.count()
    rows = (
        query.order_by(Report.created_at.desc(), Report.id.desc())
        .offset((page - 1) * pagesize)
        .limit(pagesize)
        .all()
    )
    return [row.to_dict() for row in rows], total


def get_report(user_id: int, report_no: str):
    """
    查一份报告详情；只允许看自己的。

    返回：字典（含 vul_list / scan_meta / suggestions），查不到返回 None
    """
    report = Report.query.filter_by(user_id=user_id, report_no=report_no).first()
    return report.to_detail_dict() if report else None


def delete_report(user_id: int, operator_name: str, report_no: str):
    """
    删除自己的一份报告。

    注意：删的是业务报告，不是审计日志；审计日志仍然没有删除接口。
    返回：(是否成功, 提示, HTTP 状态码)
    """
    report = Report.query.filter_by(user_id=user_id, report_no=report_no).first()
    if not report:
        return False, "报告不存在或无权删除", 404

    target_name = report.file_name or report.url or ""
    try:
        db.session.delete(report)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return False, "删除失败，请稍后重试", 500

    write_log(
        action="DELETE_REPORT",
        operator_id=user_id,
        operator_name=operator_name,
        target_type="report",
        target_id=report_no,
        detail={"report_no": report_no, "file_name": target_name},
        result="SUCCESS",
        message="删除报告",
    )

    return True, "删除成功", 200
