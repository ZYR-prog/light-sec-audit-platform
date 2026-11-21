# -*- coding: utf-8 -*-
"""
app.py —— Flask 主入口
======================

启动方式：
    python app.py

📌 用了"应用工厂"模式：create_app() 负责创建并配置 app。
   好处：测试时可以创建一个独立的 app，互不污染。

启动时依次做这几件事：
1. 创建 Flask 实例
2. 加载配置（config.py）
3. 开启 CORS（前后端分离必需）
4. 初始化数据库、建表
5. 注册路由（各功能模块的 Blueprint）
6. 注册基础接口（/api/ping、/api/health）
7. 统一错误处理
"""

import os
from datetime import datetime

from flask import Flask, jsonify
from sqlalchemy import text

from config import config
from utils.db import db, init_db


def create_app(config_name="default"):
    """创建并配置 Flask 应用"""

    app = Flask(__name__, static_folder="../frontend", static_url_path="/")
    app.config.from_object(config[config_name])

    # 前后端分离：允许浏览器跨域访问接口
    from flask_cors import CORS
    CORS(app)

    # 确保 data 目录存在（SQLite 文件要放这里）
    os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)

    # 绑定数据库，并只创建 users / audit_logs / reports 三张核心表
    init_db(app)

    # ---------------- 注册各功能路由 ----------------
    from routes.auth import auth_bp
    from routes.audit import audit_bp
    from routes.history import history_bp
    from routes.reports import reports_bp
    from routes.scanner import scanner_bp

    app.register_blueprint(auth_bp)      # /api/auth/*
    app.register_blueprint(audit_bp)     # /api/audit-logs
    app.register_blueprint(history_bp)   # /api/history/*
    app.register_blueprint(reports_bp)   # /api/reports/*
    app.register_blueprint(scanner_bp)   # /api/scanner/*

    # ---------------- 基础接口 ----------------
    @app.route("/api/ping", methods=["GET"])
    def ping():
        """最小可用探活接口，不查数据库、不写日志，越轻越好"""
        return jsonify({
            "code": 200,
            "message": "pong",
            "data": {"time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")},
        })

    @app.route("/api/health", methods=["GET"])
    def health():
        """健康检查：额外验证数据库是否可用"""
        try:
            db.session.execute(text("SELECT 1"))
            db_status = "ok"
        except Exception:
            db_status = "error"
        code = 200 if db_status == "ok" else 503
        return jsonify({
            "code": code,
            "message": "后端在线" if code == 200 else "服务异常",
            "data": {
                "status": "ok" if code == 200 else "degraded",
                "db": db_status,
                "version": "1.0.0",
            },
        }), code

    # ---------------- 统一错误处理 ----------------
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"code": 404, "message": "接口不存在", "data": None}), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({"code": 405, "message": "请求方法不允许", "data": None}), 405

    @app.errorhandler(500)
    def server_error(error):
        return jsonify({"code": 500, "message": "服务器内部错误", "data": None}), 500

    return app


if __name__ == "__main__":
    app = create_app("development")
    print("=" * 50)
    print("Flask 服务器已启动")
    print("探活接口: http://127.0.0.1:5000/api/ping")
    print("健康检查: http://127.0.0.1:5000/api/health")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=True)
