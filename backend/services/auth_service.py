# -*- coding: utf-8 -*-
"""
services/auth_service.py —— 用户认证业务逻辑
=============================================

📌 分层职责：
   路由层（routes/auth.py）：收请求、返回响应
   服务层（本文件）：校验、查库、写库、写审计日志

📌 统一返回格式：
   (是否成功, 数据或提示, HTTP状态码, 字段错误列表)
   这样路由层不用自己判断该返 400 还是 401。
"""

import re

from models import User
from services.audit_service import write_log
from utils.db import db
from utils.helpers import generate_token, hash_password, verify_password

# 用户名规则：3-20 位，字母/数字/下划线
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,20}$")

# 登录失败统一文案：
# 不区分"用户不存在"和"密码错误"，防止攻击者靠提示语枚举出哪些账号存在
LOGIN_FAIL_MESSAGE = "用户名或密码错误"


def _validate_password(password: str):
    """返回错误提示；合法返回 None"""
    if not password:
        return "密码不能为空"
    if len(password) < 6 or len(password) > 32:
        return "密码长度需为 6-32 位"
    return None


def register_user(username: str, password: str):
    """
    用户注册

    成功：返回 (True, {"user": {...}, "token": "..."}, 200, None)
    失败：返回 (False, 提示, 状态码, [{"field": ..., "message": ...}])
    """
    username = (username or "").strip()
    password = password or ""

    # ---------- 1. 后端校验（不能只靠前端） ----------
    errors = []
    if not username:
        errors.append({"field": "username", "message": "用户名不能为空"})
    elif not USERNAME_PATTERN.match(username):
        errors.append({
            "field": "username",
            "message": "用户名只能包含字母、数字、下划线，长度 3-20",
        })

    pwd_error = _validate_password(password)
    if pwd_error:
        errors.append({"field": "password", "message": pwd_error})
    elif username and password == username:
        errors.append({"field": "password", "message": "密码不能与用户名相同"})

    if errors:
        # 参数都没通过，不写审计日志：这种请求没有分析价值，只会把日志刷爆
        return False, "参数校验失败", 400, errors

    # ---------- 2. 查重 ----------
    if User.query.filter_by(username=username).first():
        return False, "用户名已被占用", 409, None

    # ---------- 3. 入库 ----------
    try:
        user = User(
            username=username,
            password_hash=hash_password(password),
            role="user",
        )
        db.session.add(user)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return False, "注册失败，请稍后重试", 500, None

    # ---------- 4. 写审计日志 ----------
    # 细节：只记用户名，绝不记密码；target 指向新建的用户
    write_log(
        action="REGISTER",
        operator_id=user.id,
        operator_name=user.username,
        target_type="user",
        target_id=user.id,
        detail={"username": user.username, "role": user.role},
        result="SUCCESS",
        message="注册成功",
    )

    return True, {"user": user.to_dict(), "token": generate_token(user.id)}, 200, None


def login_user(username: str, password: str):
    """
    用户登录

    成功：返回 (True, {"user": {...}, "token": "..."}, 200, None)
    失败：返回 (False, 提示, 状态码, 错误列表)
    """
    username = (username or "").strip()
    password = password or ""

    # ---------- 1. 参数校验 ----------
    errors = []
    if not username:
        errors.append({"field": "username", "message": "用户名不能为空"})
    if not password:
        errors.append({"field": "password", "message": "密码不能为空"})
    if errors:
        return False, "参数校验失败", 400, errors

    # ---------- 2. 查用户 ----------
    user = User.query.filter_by(username=username).first()

    # 用户不存在 / 密码错误 → 走同一个分支，返回同一句文案
    if not user or not verify_password(password, user.password_hash):
        # 登录失败必须记日志：这是发现暴力破解的唯一线索
        # operator_name 记"尝试登录的用户名"，而不是"游客"，方便溯源
        write_log(
            action="LOGIN_FAIL",
            operator_id=user.id if user else None,
            operator_name=username[:64],
            target_type="session",
            target_id=None,
            detail={"username": username},
            result="FAIL",
            error_code=401,
            message=LOGIN_FAIL_MESSAGE,
        )
        return False, LOGIN_FAIL_MESSAGE, 401, None

    # ---------- 3. 登录成功 ----------
    write_log(
        action="LOGIN",
        operator_id=user.id,
        operator_name=user.username,
        target_type="session",
        target_id=user.id,
        detail={"username": user.username, "role": user.role},
        result="SUCCESS",
        message="登录成功",
    )

    return True, {"user": user.to_dict(), "token": generate_token(user.id)}, 200, None
