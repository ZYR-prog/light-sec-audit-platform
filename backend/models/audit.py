# -*- coding: utf-8 -*-
"""
models/audit.py —— 审计日志表（单独成表、单独文件）
=====================================================

📌 审计表的核心使命：能"还原现场"。必须回答 5 个问题：

   谁     → operator_id / operator_name
   什么时候 → created_at
   做了什么 → action（动作代码）
   对什么  → target_type / target_id
   结果如何 → result / error_code / message

再补两个辅助字段 ip、user_agent，基本就能还原一次操作的全貌。

📌 几条硬规则（设计时就想清楚，后面不容易踩坑）：
1. 不存密码、token、Cookie 等敏感信息（写入前统一脱敏）
2. 不跟业务表做外键关联（operator_name 存"快照"）
   原因：用户被删了，历史日志必须还在，不能跟着一起挂掉
3. 应用层不提供删除接口，清理只能走离线命令（manage.py）
4. 建好索引，因为它会越来越长，查询必须走索引 + 分页
"""

from datetime import datetime

from sqlalchemy import Index

from utils.db import db


class AuditLog(db.Model):
    """审计日志表"""

    __tablename__ = "audit_logs"

    # 索引怎么选：按时间倒序翻页、按人查、按动作查，是最常用的三种
    __table_args__ = (
        Index("ix_audit_created", "created_at"),
        Index("ix_audit_operator_created", "operator_id", "created_at"),
        Index("ix_audit_action_created", "action", "created_at"),
    )

    id = db.Column(db.Integer, primary_key=True)

    # --- 请求标识：同一次请求产生的多条日志可以串起来排查 ---
    request_id = db.Column(db.String(36), nullable=True)

    # --- 谁 ---
    # 注意：这里故意不加 ForeignKey。
    # 审计数据要独立于业务数据存活，用户删了也不影响日志。
    operator_id = db.Column(db.Integer, nullable=True)
    operator_name = db.Column(db.String(64), nullable=False, default="游客")

    # --- 做了什么 ---
    # 取值必须来自 audit_service.ACTIONS 里定义的枚举，不允许随便写
    action = db.Column(db.String(32), nullable=False)

    # --- 对什么 ---
    target_type = db.Column(db.String(32), nullable=False, default="")
    target_id = db.Column(db.String(64), nullable=True)

    # --- 细节（JSON 字符串，写入前已脱敏、已截断）---
    detail = db.Column(db.Text, nullable=True)

    # --- 结果如何 ---
    result = db.Column(db.String(8), nullable=False, default="SUCCESS")  # SUCCESS / FAIL
    error_code = db.Column(db.Integer, nullable=True)
    message = db.Column(db.String(200), nullable=True)

    # --- 现场信息 ---
    ip = db.Column(db.String(45), nullable=True)           # IPv6 最长 45 位
    user_agent = db.Column(db.String(255), nullable=True)

    # --- 什么时候 ---
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)

    def to_dict(self):
        return {
            "log_id": self.id,
            "request_id": self.request_id,
            "operator_id": self.operator_id,
            "operator": self.operator_name,
            "operate_time": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
            "operate_type": self.action,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "detail": self.detail,
            "result": self.result,
            "error_code": self.error_code,
            "message": self.message,
            "ip": self.ip,
            "user_agent": self.user_agent,
        }
