# -*- coding: utf-8 -*-
"""
routes/scanner.py —— URL 安全检测接口
=======================================

    POST /api/scanner/scan     执行检测（游客也能用）
    GET  /api/scanner/history  分页查询我的检测历史
"""

from flask import Blueprint, jsonify, request

from services.scanner_service import get_scan_history, scan_url
from utils.helpers import get_current_user, json_response, paginated, parse_pagination

scanner_bp = Blueprint("scanner", __name__, url_prefix="/api/scanner")


@scanner_bp.route("/scan", methods=["POST"])
def scan():
    # 未登录也允许检测，只是不保存报告
    user = get_current_user()

    data = request.get_json(silent=True)
    data = data if isinstance(data, dict) else {}
    url = data.get("url", "")
    if not isinstance(url, str):
        return jsonify(json_response(
            None, code=400, message="参数校验失败",
            errors=[{"field": "url", "message": "url 必须是字符串"}],
        )), 400

    ok, result = scan_url(url.strip(), user.id if user else None)
    if ok:
        return jsonify(json_response(result, code=200, message="检测完成")), 200
    return jsonify(json_response(None, code=400, message=result)), 400


@scanner_bp.route("/history", methods=["GET"])
def history():
    user = get_current_user()
    if not user:
        return jsonify(json_response(None, code=401, message="未登录")), 401

    page, pagesize, errors = parse_pagination()
    if errors:
        return jsonify(json_response(None, code=400, message="参数校验失败", errors=errors)), 400

    rows, total = get_scan_history(user.id, page, pagesize)
    return jsonify(json_response(paginated(rows, total, page, pagesize), code=200)), 200
