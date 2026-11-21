# -*- coding: utf-8 -*-
"""
utils/helpers.py —— 通用工具函数
=================================
放"到处都能用"的小工具：密码哈希、token、统一响应、取 IP、登录校验。
"""

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta
from functools import wraps

from flask import g, jsonify, request

from config import config
from utils.db import db


# ============================================================
# 一、密码相关
# ============================================================
def hash_password(password: str) -> str:
    """
    给密码做哈希（werkzeug 自带随机盐，同一密码每次结果都不同）。

    铁律：数据库里永远不出现明文密码。
    """
    from werkzeug.security import generate_password_hash
    return generate_password_hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """
    校验密码。

    兼容早期用无盐 SHA256 存下的旧数据；新注册一律走加盐哈希。
    """
    if not hashed:
        return False
    if hashed.startswith(("pbkdf2:", "scrypt:")):
        from werkzeug.security import check_password_hash
        return check_password_hash(hashed, password)
    legacy = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy, hashed)


# ============================================================
# 二、Token 相关
# ============================================================
def _sign(payload: str) -> str:
    """
    用服务端 SECRET_KEY 给 token 负载做 HMAC 签名。

    没有这个签名，token 就是"用户ID.过期时间.随便填"，
    任何人都能伪造别人身份。签名后客户端改任何一个字符都会校验失败。
    """
    secret = config["default"].SECRET_KEY.encode("utf-8")
    return hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def generate_token(user_id: int, days: int = None) -> str:
    """
    生成登录 token，格式：用户ID.过期时间戳.HMAC签名

    注意：这是轻量版"自签 token"，不是 JWT。
    缺点：服务端无法主动让某个 token 失效（没有黑名单）。
    生产建议：换 JWT 或存 token 表。
    """
    if days is None:
        days = config["default"].TOKEN_EXPIRE_DAYS
    expire_ts = int((datetime.now() + timedelta(days=days)).timestamp())
    payload = f"{user_id}.{expire_ts}"
    return f"{payload}.{_sign(payload)}"


def parse_token(token: str):
    """
    解析 token，返回 user_id；签名不对、格式不对或已过期返回 None
    """
    if not token:
        return None
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        user_id = int(parts[0])
        expire_ts = int(parts[1])
        signature = parts[2]
        if datetime.now().timestamp() > expire_ts:
            return None
        # 先验签，再信任里面的 user_id
        if not hmac.compare_digest(signature, _sign(f"{user_id}.{expire_ts}")):
            return None
        return user_id
    except (ValueError, TypeError):
        return None


def get_bearer_token():
    """
    从请求头里取 token。

    只认 Authorization: Bearer xxx。
    注意：不支持 ?token=xxx（URL 传 token 会泄漏到日志和浏览器历史）。
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    return ""


def get_current_user():
    """
    取当前登录用户对象；未登录/token 无效返回 None。
    """
    user_id = parse_token(get_bearer_token())
    if not user_id:
        return None
    return db_get_user(user_id)


def db_get_user(user_id):
    """按 id 查用户（单独抽出来，方便测试时替换）"""
    from models import User
    return db.session.get(User, user_id)


def login_required(view_func):
    """
    装饰器：要求请求必须带有效的 Bearer token。

    未登录 / token 失效统一返回 401，并把当前用户放到 g.current_user，
    路由里直接使用，避免每个接口重复写"取 token → 查用户 → 判空"。
    """
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify(json_response(None, code=401, message="未登录或登录已过期")), 401
        g.current_user = user
        return view_func(*args, **kwargs)

    return wrapper


def admin_required(view_func):
    """
    装饰器：只允许管理员访问。

    用法：
        @audit_bp.route("/api/audit-logs")
        @admin_required
        def list_logs(): ...

    这就是"访问控制"的落地点：普通用户访问会收到 403。
    """
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify(json_response(None, code=401, message="未登录或登录已过期")), 401
        if user.role != "admin":
            # 不告诉对方"你需要管理员权限"的细节？这里可以给，因为不涉及枚举风险
            return jsonify(json_response(None, code=403, message="无权限访问")), 403
        g.current_user = user
        return view_func(*args, **kwargs)

    return wrapper


# ============================================================
# 三、请求上下文
# ============================================================
def get_client_ip() -> str:
    """
    取客户端 IP。

    默认只信 TCP 连接的对端地址 remote_addr。
    X-Forwarded-For 客户端可以随便伪造，默认不读；
    只有确认部署在可信反向代理后（TRUST_PROXY_HEADERS=1）才取它的第一段。
    """
    if config["default"].TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:45]
    return (request.remote_addr or "")[:45]


def get_request_id() -> str:
    """
    每个请求生成一个唯一 ID，写进审计日志。
    同一次操作如果产生多条日志，可以用它串起来。
    """
    if not hasattr(g, "request_id"):
        g.request_id = uuid.uuid4().hex
    return g.request_id


# ============================================================
# 四、统一响应
# ============================================================
def json_response(data=None, code=200, message="success", errors=None):
    """
    统一响应结构：

    { "code": 200, "message": "success", "data": ..., "errors": [...] }

    - code 与 HTTP 状态码保持一致
    - errors 只在参数校验失败时出现，前端可据此定位到具体表单项
    """
    body = {"code": code, "message": message, "data": data}
    if errors:
        body["errors"] = errors
    return body


def parse_pagination(default_size=10, max_size=100):
    """
    解析查询参数里的 page / pagesize。

    返回 (page, pagesize, errors)：
    - errors 为空表示合法
    - 非法时仍返回可用的默认值，避免后续计算报错
    """
    errors = []
    try:
        page = int(request.args.get("page", 1) or 1)
    except ValueError:
        page = 1
        errors.append({"field": "page", "message": "page 必须是整数"})

    try:
        pagesize = int(request.args.get("pagesize", default_size) or default_size)
    except ValueError:
        pagesize = default_size
        errors.append({"field": "pagesize", "message": "pagesize 必须是整数"})

    if page < 1:
        errors.append({"field": "page", "message": "page 必须大于等于 1"})
    if pagesize < 1:
        errors.append({"field": "pagesize", "message": "pagesize 必须大于等于 1"})

    return page, min(pagesize, max_size), errors


def paginated(rows, total, page, pagesize):
    """把列表和总数包装成统一的分页结构"""
    return {
        "list": rows,
        "total": total,
        "page": page,
        "pagesize": pagesize,
        "total_pages": (total + pagesize - 1) // pagesize if total else 0,
    }
