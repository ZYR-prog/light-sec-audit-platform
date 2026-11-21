# -*- coding: utf-8 -*-
"""
routes/reports.py —— 文件审计报告接口
=======================================

    POST   /api/reports/save          保存一次文件审计结果（兼容旧路径）
    POST   /api/reports               保存一次文件审计结果（REST 写法）
    GET    /api/reports               我的报告历史（分页）
    GET    /api/reports/{report_no}   报告详情
    PUT    /api/reports/{report_no}   修改报告（部分字段）
    PATCH  /api/reports/{report_no}   修改报告（部分字段）
    DELETE /api/reports/{report_no}   删除我的报告

📌 所有接口都要求登录（login_required）。
   未登录返回 401，前端收到后把扫描结果存 localStorage 即可。

📌 与 /api/history 的关系：
   history 是"审计历史"视角（只看 file 类型），reports 是"报告"视角（file / url）。
   两者底层同一张 reports 表，不会产生两份互相矛盾的数据。
"""

from flask import Blueprint, g, jsonify, request

from services import report_service
from utils.helpers import (
    json_response,
    login_required,
    paginated,
    parse_pagination,
)

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def _read_json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _save(current_user):
    ok, payload, code, errors = report_service.save_file_report(
        current_user.id, current_user.username, _read_json()
    )
    if ok:
        return jsonify(json_response(payload, code=code, message="保存成功")), code
    return jsonify(json_response(
        None, code=code, message=payload, errors=errors
    )), code


@reports_bp.route("/save", methods=["POST"])
@login_required
def save_report():
    return _save(g.current_user)


@reports_bp.route("", methods=["POST"])
@reports_bp.route("/", methods=["POST"])
@login_required
def create_report():
    return _save(g.current_user)


@reports_bp.route("", methods=["GET"])
@reports_bp.route("/", methods=["GET"])
@login_required
def list_reports():
    page, pagesize, errors = parse_pagination()
    if errors:
        return jsonify(json_response(
            None, code=400, message="参数校验失败", errors=errors
        )), 400

    report_type = request.args.get("report_type") or None
    if report_type and report_type not in ("file", "url"):
        return jsonify(json_response(
            None,
            code=400,
            message="参数校验失败",
            errors=[{"field": "report_type", "message": "只能是 file 或 url"}],
        )), 400

    rows, total = report_service.list_reports(
        g.current_user.id, page, pagesize, report_type
    )
    return jsonify(json_response(
        paginated(rows, total, page, pagesize), code=200
    )), 200


@reports_bp.route("/<report_no>", methods=["GET"])
@login_required
def report_detail(report_no):
    report = report_service.get_report(g.current_user.id, report_no)
    if not report:
        return jsonify(json_response(
            None, code=404, message="报告不存在或无权查看"
        )), 404

    return jsonify(json_response(report, code=200)), 200


@reports_bp.route("/<report_no>", methods=["PUT", "PATCH"])
@login_required
def update_report(report_no):
    ok, payload, code, errors = report_service.update_file_report(
        g.current_user.id, g.current_user.username, report_no, _read_json()
    )
    if ok:
        return jsonify(json_response(payload, code=code, message="更新成功")), code
    return jsonify(json_response(
        None, code=code, message=payload, errors=errors
    )), code


@reports_bp.route("/<report_no>", methods=["DELETE"])
@login_required
def remove_report(report_no):
    ok, message, code = report_service.delete_report(
        g.current_user.id, g.current_user.username, report_no
    )
    return jsonify(json_response(None, code=code, message=message)), code
