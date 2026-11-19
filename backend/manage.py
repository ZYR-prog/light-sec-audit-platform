# -*- coding: utf-8 -*-
"""
manage.py —— 运维命令（不经过网页，直接在服务器上执行）
=========================================================

📌 为什么审计日志的清理要放在这里，而不是做成接口？
   因为日志一旦能通过网页删除，就失去了"不可篡改"的意义。
   清理属于运维动作，必须由能登录服务器的人执行，并且建议先归档。

用法：
    python manage.py init-db
    python manage.py create-admin --username admin --password Admin@123456
    python manage.py audit-stats
    python manage.py audit-cleanup --days 90 --archive data/audit_20261118.csv
"""

import argparse
import os

from app import create_app
from config import config
from sqlalchemy import text
from utils.db import create_core_tables, db
from utils.helpers import hash_password


def cmd_init_db(args):
    """建表（重复执行安全，已存在的表不会重建；只建三张核心表）"""
    app = create_app("default")
    with app.app_context():
        create_core_tables()
    print("数据库表已创建（users / audit_logs / reports）")


def cmd_create_admin(args):
    """创建管理员账号（审计日志的访问控制需要 admin 角色）"""
    from models import User

    app = create_app("default")
    with app.app_context():
        if len(args.password) < 6:
            print("密码至少 6 位")
            return

        existing = User.query.filter_by(username=args.username).first()
        if existing:
            if existing.role == "admin":
                print(f"管理员 {args.username} 已存在")
                return
            # 已存在普通用户，可以直接升级为管理员
            existing.role = "admin"
            db.session.commit()
            print(f"用户 {args.username} 已升级为管理员")
            return

        user = User(
            username=args.username,
            password_hash=hash_password(args.password),
            role="admin",
        )
        db.session.add(user)
        db.session.commit()
        print(f"管理员 {args.username} 创建成功（id={user.id}）")


def cmd_audit_stats(args):
    """查看日志规模，决定要不要清理"""
    from services.audit_service import stats

    app = create_app("default")
    with app.app_context():
        info = stats()
        print(f"日志总数：{info['total']}")
        print(f"最早一条：{info['earliest']}")
        print(f"最新一条：{info['latest']}")


def cmd_audit_cleanup(args):
    """归档并删除过期日志"""
    from services.audit_service import cleanup, stats

    app = create_app("default")
    with app.app_context():
        before = stats()["total"]
        removed = cleanup(days=args.days, archive_path=args.archive)

        if removed and args.vacuum:
            # 删除后 SQLite 不会自动还磁盘，VACUUM 才真正回收。
            # 注意：VACUUM 不能在事务里执行，所以用 AUTOCOMMIT 连接。
            with db.engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                conn.execute(text("VACUUM"))

        print(f"清理前 {before} 条，删除 {removed} 条（保留最近 {args.days} 天）")
        if args.archive and removed:
            print(f"已归档到：{os.path.abspath(args.archive)}")
        if removed and not args.vacuum:
            print("提示：加 --vacuum 可回收磁盘空间（数据量大时会较慢）")


def build_parser():
    parser = argparse.ArgumentParser(description="安全审计平台运维命令")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init-db", help="创建所有数据库表")
    p.set_defaults(func=cmd_init_db)

    p = sub.add_parser("create-admin", help="创建管理员账号")
    p.add_argument("--username", required=True)
    p.add_argument("--password", required=True)
    p.set_defaults(func=cmd_create_admin)

    p = sub.add_parser("audit-stats", help="查看审计日志概况")
    p.set_defaults(func=cmd_audit_stats)

    p = sub.add_parser("audit-cleanup", help="归档并删除过期审计日志")
    p.add_argument("--days", type=int, default=config["default"].AUDIT_RETENTION_DAYS)
    p.add_argument("--archive", default="")
    p.add_argument("--vacuum", action="store_true")
    p.set_defaults(func=cmd_audit_cleanup)

    return parser


if __name__ == "__main__":
    args = build_parser().parse_args()
    args.func(args)
