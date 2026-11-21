# -*- coding: utf-8 -*-
"""
models/models.py —— 业务表（用户表、报告表）
=============================================

📌 为什么审计表不放在这个文件里？
—— 审计数据是"只增不改、需要单独清理"的特殊数据，
   跟业务表混在一起会让清理、归档、迁移都变麻烦。
   所以审计表单独放在 models/audit.py 里，独立成表、独立服务。
"""

import json
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text

from utils.db import db


# ============================================================
# 表 1：users —— 用户表
# ============================================================
class User(db.Model):
    """
    用户表

    字段说明：
    - id            主键
    - username      用户名（唯一）
    - password_hash 密码哈希（绝不存明文）
    - role          角色：user=普通用户，admin=管理员
                    审计日志的"访问控制"就靠这个字段：
                    只有 admin 才能查看全部日志，普通用户不行
    - created_at    注册时间
    """
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(32), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(16), nullable=False, default="user")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)

    def to_dict(self):
        """转成字典再返回给前端（注意：永远不返回 password_hash）"""
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }


# ============================================================
# 表 3：reports —— 报告表（文件审计 + URL 检测）
# ============================================================
class Report(db.Model):
    """
    报告表（保存审计/检测结果）

    两类报告共用一张表，用 report_type 区分：
    - report_type = "file"：文件审计结果（功能2 用，对应 scan.js 的 ScanResult）
    - report_type = "url" ：URL 安全检测结果（功能3 用）

    字段说明：
    - report_no   对外编号（前端展示、分享用），不暴露自增 id
    - user_id     归属用户；未登录时为 NULL（游客报告）
    - report_type 报告类型：file / url
    - url         被检测的网址（report_type=url 时有值）
    - file_name   被审计的文件名（report_type=file 时有值）
    - score       安全评分 0-100（文件审计可为空）
    - grade       等级（A 优秀 / B 良好 ...）
    - stat        风险统计（JSON：{high, mid, low, total}）
    - details     明细（JSON 字符串：文件审计存 vul_list，URL 检测存三项检查结果）
    - suggestions 改进建议（JSON 数组字符串）
    - created_at  生成时间

    索引：按"用户 + 时间"、"类型 + 时间"查询历史报告是最常见的操作。
    """
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_user_created", "user_id", "created_at"),
        Index("ix_reports_type_created", "report_type", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    report_no = Column(String(32), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    report_type = Column(String(16), nullable=False, default="url")
    url = Column(String(512), nullable=True)
    file_name = Column(String(255), nullable=True)
    score = Column(Integer, nullable=True)
    grade = Column(String(16), nullable=True)
    stat = Column(Text, nullable=True)
    details = Column(Text, nullable=True)
    suggestions = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now, index=True)

    def to_dict(self, with_detail=False):
        """
        转字典。

        参数 with_detail：列表页不需要大字段 details，默认不返回，
        避免一页数据就有几百 KB。
        """
        data = {
            "report_no": self.report_no,
            "report_type": self.report_type,
            "url": self.url,
            "file_name": self.file_name,
            "score": self.score,
            "grade": self.grade,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }
        if self.stat:
            data["stat"] = json.loads(self.stat)
        if with_detail:
            data["details"] = json.loads(self.details) if self.details else None
            data["suggestions"] = json.loads(self.suggestions) if self.suggestions else []
        return data

    def to_detail_dict(self):
        """
        详情页专用：在摘要基础上，把文件审计的 vul_list / scan_meta 提到顶层，
        前端可以直接按 scan.js 的 ScanResult 结构使用。
        """
        data = self.to_dict()
        details = json.loads(self.details) if self.details else None
        if isinstance(details, dict):
            if "vul_list" in details:
                data["vul_list"] = details["vul_list"]
            if "scan_meta" in details:
                data["scan_meta"] = details["scan_meta"]
        data["details"] = details
        data["suggestions"] = json.loads(self.suggestions) if self.suggestions else []
        return data
