# -*- coding: utf-8 -*-
"""
routes/audit.py —— 审计日志查询接口（仅管理员）
=================================================

📌 访问控制（本项目最关键的安全设计之一）：
   - 登录用户只能是 user 角色 → 403
   - 只有 role=admin 才能查询
   - 没有"查看全部日志"以外的能力

📌 为什么没有 DELETE 接口？
   审计日志一旦可以被应用层删除，就不再是可信证据。
   清理只能通过服务器上的 manage.py audit-cleanup 执行。

📌 为什么必须分页？
   日志只增不减，全量返回迟早会把内存和浏览器拖死。
"""

from datetime import datetime

from flask import Blueprint, jsonify, request

from config import config
from services.audit_service import ACTIONS, query_logs
from utils.helpers import admin_required, json_response

audit_bp = Blueprint("audit", __name__, url_prefix="/api")


def _parse_time(raw, field):
    """把 'YYYY-MM-DD HH:mm:ss' 转成 datetime；非法返回 (None, 错误)"""
    if not raw:
        return None, None
    try:
        return datetime.strptime(raw, "%Y-%m-%d %H:%M:%S"), None
    except ValueError:
        return None, {"field": field, "message": "时间格式应为 YYYY-MM-DD HH:mm:ss"}


@audit_bp.route("/audit-logs", methods=["GET"])
@admin_required
def list_audit_logs():
    """
    查询审计日志（管理员）

    查询参数：
        page         页码，默认 1
        pagesize     每页条数，默认 10，最大 100
        action       动作，必须是 ACTIONS 里的枚举值
        operator     操作人（模糊匹配）
        result       SUCCESS / FAIL
        start_time   开始时间
        end_time     结束时间
        keyword      关键词（匹配 message / detail）
    """
    errors = []
    max_size = config["default"].AUDIT_MAX_PAGE_SIZE

    # ---------- 分页参数 ----------
    try:
        page = int(request.args.get("page", 1))
        pagesize = int(request.args.get("pagesize", 10))
    except ValueError:
        return jsonify(json_response(
            None, code=400, message="参数校验失败",
            errors=[{"field": "page", "message": "page 和 pagesize 必须是整数"}],
        )), 400

    if page < 1:
        errors.append({"field": "page", "message": "page 必须大于等于 1"})
    if pagesize < 1:
        errors.append({"field": "pagesize", "message": "pagesize 必须大于等于 1"})
    pagesize = min(pagesize, max_size)

    # ---------- 筛选参数 ----------
    action = request.args.get("action") or None
    if action and action not in ACTIONS:
        errors.append({
            "field": "action",
            "message": "action 必须是 " + "/".join(ACTIONS.keys()) + " 之一",
        })

    result = request.args.get("result") or None
    if result and result not in ("SUCCESS", "FAIL"):
        errors.append({"field": "result", "message": "result 只能是 SUCCESS 或 FAIL"})

    start_time, err = _parse_time(request.args.get("start_time"), "start_time")
    if err:
        errors.append(err)
    end_time, err = _parse_time(request.args.get("end_time"), "end_time")
    if err:
        errors.append(err)
    if start_time and end_time and end_time < start_time:
        errors.append({"field": "end_time", "message": "结束时间不能早于开始时间"})

    keyword = (request.args.get("keyword") or "").strip()
    if len(keyword) > 50:
        errors.append({"field": "keyword", "message": "关键词最长 50 个字符"})

    if errors:
        return jsonify(json_response(None, code=400, message="参数校验失败", errors=errors)), 400

    # ---------- 查询 ----------
    rows, total = query_logs(
        page=page,
        pagesize=pagesize,
        action=action,
        operator=(request.args.get("operator") or "").strip() or None,
        result=result,
        start_time=start_time,
        end_time=end_time,
        keyword=keyword or None,
    )

    return jsonify(json_response({
        "list": rows,
        "total": total,
        "page": page,
        "pagesize": pagesize,
        "total_pages": (total + pagesize - 1) // pagesize,
    }, code=200))
