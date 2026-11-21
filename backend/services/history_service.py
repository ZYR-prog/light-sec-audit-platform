# -*- coding: utf-8 -*-
"""
services/history_service.py —— 审计历史记录业务逻辑
=====================================================

审计历史 = 每次文件扫描留下的一条记录，复用 reports 表（report_type="file"）。
这样"历史记录"与"报告"看到的是同一份数据，不会出现两套互相矛盾的结果。

对外暴露 CRUD：
    list_history   查询我的历史（分页 + 文件名关键词）
    get_history    查详情（支持 report_no 或数据库自增 id）
    save_history   新增一条历史（等价于保存文件审计报告）
    update_history 修改历史
    delete_history 删除历史

📌 所有查询都强制带 user_id，普通用户只能看到自己的记录。
"""

from models import Report
from services import report_service


def _escape_like(text: str) -> str:
    """转义 LIKE 通配符，避免用户输入 % 或 _ 时匹配到全部记录。"""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _find_record(user_id: int, record_id: str):
    """
    按 report_no 找记录；找不到且是纯数字时再按自增 id 找。

    为什么要兼容自增 id？
    —— 目录规范里写的是 GET /api/history/:id，队友可能直接拿 id 拼 URL。
    """
    report = Report.query.filter_by(
        user_id=user_id, report_type="file", report_no=str(record_id)
    ).first()
    if report:
        return report

    text = str(record_id)
    if text.isdigit():
        return Report.query.filter_by(
            user_id=user_id, report_type="file", id=int(text)
        ).first()
    return None


def list_history(user_id: int, page: int, pagesize: int, keyword: str = None):
    """分页查询我的文件审计历史，返回 (摘要列表, 总条数)。"""
    query = Report.query.filter_by(user_id=user_id, report_type="file")

    if keyword:
        query = query.filter(
            Report.file_name.like(f"%{_escape_like(keyword)}%", escape="\\")
        )

    total = query.count()
    rows = (
        query.order_by(Report.created_at.desc(), Report.id.desc())
        .offset((page - 1) * pagesize)
        .limit(pagesize)
        .all()
    )
    return [row.to_dict() for row in rows], total


def get_history(user_id: int, record_id: str):
    """查询一条历史详情；不存在或不属于当前用户时返回 None。"""
    record = _find_record(user_id, record_id)
    return record.to_detail_dict() if record else None


def save_history(user_id: int, operator_name: str, payload: dict):
    """新增一条历史记录（复用报告校验逻辑）。"""
    return report_service.save_file_report(user_id, operator_name, payload)


def update_history(user_id: int, operator_name: str, record_id: str, payload: dict):
    """修改一条历史记录（支持只改文件名等部分字段）。"""
    record = _find_record(user_id, record_id)
    if not record:
        return False, "历史记录不存在或无权修改", 404, None
    return report_service.update_file_report(
        user_id, operator_name, record.report_no, payload
    )


def delete_history(user_id: int, operator_name: str, record_id: str):
    """删除一条历史记录。"""
    record = _find_record(user_id, record_id)
    if not record:
        return False, "历史记录不存在或无权删除", 404
    return report_service.delete_report(user_id, operator_name, record.report_no)
