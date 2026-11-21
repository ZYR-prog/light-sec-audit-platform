# -*- coding: utf-8 -*-
"""
utils/db.py —— 数据库初始化
===========================
这里定义了"数据库对象" db，整个项目都会用到它。

同时这里给 SQLite 调了三个参数（PRAGMA），解决轻量数据库最常见的两个毛病：
1. 并发写入时报 "database is locked"
2. 每次写入都要刷盘，速度慢
"""

import sqlite3
from pathlib import Path

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine

# 创建数据库对象（这里只是"声明"，还没连接）
db = SQLAlchemy()


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """
    每次建立 SQLite 连接时自动执行的设置。

    - journal_mode=WAL：写日志时读操作不被阻塞，并发更友好
    - synchronous=NORMAL：兼顾安全和速度（默认 FULL 太慢）
    - busy_timeout=5000：遇到锁时最多等 5 秒，而不是立刻报错
    - foreign_keys=ON：SQLite 默认不检查外键，打开它
    """
    if not isinstance(dbapi_connection, sqlite3.Connection):
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def create_core_tables():
    """
    只创建三张核心表：users / audit_logs / reports。

    为什么不用 db.create_all()？
    —— 这里显式指定三张核心表，避免以后新增临时/预留模型时
       被 create_all() 自动带进数据库。
    """
    from models import User, Report, AuditLog

    db.metadata.create_all(
        bind=db.engine,
        tables=[User.__table__, Report.__table__, AuditLog.__table__],
    )


def init_db(app):
    """把 db 和 Flask app 绑定，并创建三张核心表"""
    # SQLite 不会自动创建父目录；全新克隆时 backend/data/ 可能不存在。
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if uri.startswith("sqlite:///") and ":memory:" not in uri:
        db_path = Path(uri[len("sqlite:///"):])
        db_path.parent.mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    with app.app_context():
        create_core_tables()
        print("[OK] 数据库表已就绪（users / audit_logs / reports）")
