# -*- coding: utf-8 -*-
"""
routes/history.py —— 审计历史记录 CRUD 接口
=============================================

    GET    /api/history              我的历史记录列表（分页）
    POST   /api/history              新增一条历史记录
    GET    /api/history/<record_id>  历史详情（report_no 或自增 id）
    PUT    /api/history/<record_id>  修改历史记录
    PATCH  /api/history/<record_id>  修改历史记录（部分字段）
    DELETE /api/history/<record_id>  删除历史记录

📌 全部接口都要求登录：普通用户只能操作自己的记录。
   未登录统一返回 401，前端据此降级到 localStorage。
"""

from flask import Blueprint, g, jsonify, request

from services import history_service
from utils.helpers import json_response, login_required, paginated, parse_pagination

history_bp = Blueprint("history", __name__, url_prefix="/api/history")


def _read_json():
    """安全读取 JSON body：不是对象就当成空字典。"""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


@history_bp.route("", methods=["GET"])
@history_bp.route("/", methods=["GET"])
@login_required
def list_history():
    """
    查询我的历史记录

    查询参数：
        page     页码，默认 1
        pagesize 每页条数，默认 10，最大 100
        keyword  文件名关键词（模糊匹配）
    """
    page, pagesize, errors = parse_pagination()
    if errors:
        return jsonify(json_response(
            None, code=400, message="参数校验失败", errors=errors
        )), 400

    keyword = (request.args.get("keyword") or "").strip()
    if len(keyword) > 100:
        return jsonify(json_response(
            None,
            code=400,
            message="参数校验失败",
            errors=[{"field": "keyword", "message": "keyword 最长 100 个字符"}],
        )), 400

    rows, total = history_service.list_history(
        g.current_user.id, page, pagesize, keyword or None
    )
    return jsonify(json_response(
        paginated(rows, total, page, pagesize), code=200
    )), 200


@history_bp.route("/", methods=["POST"])
@history_bp.route("", methods=["POST"])
@login_required
def create_history():
    """新增一条历史记录，请求体就是 scan.js 的 ScanResult。"""
    ok, payload, code, errors = history_service.save_history(
        g.current_user.id, g.current_user.username, _read_json()
    )
    if ok:
        return jsonify(json_response(payload, code=code, message="保存成功")), code
    return jsonify(json_response(
        None, code=code, message=payload, errors=errors
    )), code


@history_bp.route("/<record_id>", methods=["GET"])
@login_required
def history_detail(record_id):
    """查询一条历史记录详情。"""
    record = history_service.get_history(g.current_user.id, record_id)
    if not record:
        return jsonify(json_response(
            None, code=404, message="历史记录不存在或无权查看"
        )), 404
    return jsonify(json_response(record, code=200)), 200


@history_bp.route("/<record_id>", methods=["PUT", "PATCH"])
@login_required
def update_history(record_id):
    """修改一条历史记录；只传需要改的字段即可。"""
    ok, payload, code, errors = history_service.update_history(
        g.current_user.id, g.current_user.username, record_id, _read_json()
    )
    if ok:
        return jsonify(json_response(payload, code=code, message="更新成功")), code
    return jsonify(json_response(
        None, code=code, message=payload, errors=errors
    )), code


@history_bp.route("/<record_id>", methods=["DELETE"])
@login_required
def delete_history(record_id):
    """删除一条历史记录。"""
    ok, message, code = history_service.delete_history(
        g.current_user.id, g.current_user.username, record_id
    )
    return jsonify(json_response(None, code=code, message=message)), code
