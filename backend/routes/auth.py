# -*- coding: utf-8 -*-
"""
routes/auth.py —— 用户认证接口
================================

接口列表：
    POST /api/auth/register  注册
    POST /api/auth/login     登录
    GET  /api/auth/me        获取当前用户（校验 token 是否还有效）

📌 这一层只做三件事：拿参数 → 调服务 → 返回 JSON。
   真正的业务判断都在 services/auth_service.py 里。
"""

from flask import Blueprint, jsonify, request

from services.auth_service import login_user, register_user
from utils.helpers import get_current_user, json_response

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _read_json():
    """安全地读取 JSON body：不是对象就当成空字典"""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


@auth_bp.route("/register", methods=["POST"])
def register():
    data = _read_json()
    ok, payload, code, errors = register_user(
        data.get("username", ""),
        data.get("password", ""),
    )
    if ok:
        return jsonify(json_response(payload, code=code, message="注册成功")), code
    return jsonify(json_response(None, code=code, message=payload, errors=errors)), code


@auth_bp.route("/login", methods=["POST"])
def login():
    data = _read_json()
    ok, payload, code, errors = login_user(
        data.get("username", ""),
        data.get("password", ""),
    )
    if ok:
        return jsonify(json_response(payload, code=code, message="登录成功")), code
    return jsonify(json_response(None, code=code, message=payload, errors=errors)), code


@auth_bp.route("/me", methods=["GET"])
def me():
    user = get_current_user()
    if not user:
        return jsonify(json_response(None, code=401, message="未登录或登录已过期")), 401
    return jsonify(json_response(user.to_dict(), code=200))
