# -*- coding: utf-8 -*-
"""
routes/reports.py —— 文件审计报告接口
=======================================

    POST   /api/reports/save          保存一次文件审计结果
    GET    /api/reports               我的报告历史（分页）
    GET    /api/reports/{report_no}   报告详情
    DELETE /api/reports/{report_no}   删除我的报告

📌 旧 /api/progress/* 已删除：
   旧接口存的是"学习进度/测验分数"，与前端页面不匹配。
   这里存的是"审计过的文件 + vul_list/stat/scan_meta"，对应功能2。

📌 降级策略：
   未登录返回 401，前端收到 401 后把扫描结果存 localStorage 即可。
"""

from flask import Blueprint, jsonify, request

from services import report_service
from utils.helpers import (
    get_current_user,
    json_response,
    paginated,
    parse_pagination,
)

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def _read_json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


@reports_bp.route("/save", methods=["POST"])
def save_report():
    user = get_current_user()
    if not user:
        return jsonify(json_response(
            None, code=401, message="未登录，报告未保存到服务器"
        )), 401

    ok, payload, code, errors = report_service.save_file_report(
        user.id, user.username, _read_json()
    )
    if ok:
        return jsonify(json_response(payload, code=code, message="保存成功")), code
    return jsonify(json_response(None, code=code, message=payload, errors=errors)), code


@reports_bp.route("", methods=["GET"])
@reports_bp.route("/", methods=["GET"])
def list_reports():
    user = get_current_user()
    if not user:
        return jsonify(json_response(None, code=401, message="未登录")), 401

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
        user.id, page, pagesize, report_type
    )
    return jsonify(json_response(
        paginated(rows, total, page, pagesize), code=200
    )), 200


@reports_bp.route("/<report_no>", methods=["GET"])
def report_detail(report_no):
    user = get_current_user()
    if not user:
        return jsonify(json_response(None, code=401, message="未登录")), 401

    report = report_service.get_report(user.id, report_no)
    if not report:
        return jsonify(json_response(
            None, code=404, message="报告不存在或无权查看"
        )), 404

    return jsonify(json_response(report, code=200)), 200


@reports_bp.route("/<report_no>", methods=["DELETE"])
def remove_report(report_no):
    user = get_current_user()
    if not user:
        return jsonify(json_response(None, code=401, message="未登录")), 401

    ok, message, code = report_service.delete_report(
        user.id, user.username, report_no
    )
    if ok:
        return jsonify(json_response(None, code=code, message=message)), code
    return jsonify(json_response(None, code=code, message=message)), code
