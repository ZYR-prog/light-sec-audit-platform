# -*- coding: utf-8 -*-
"""
config.py —— 配置文件
=====================
把所有"可配置"的东西集中放在这里，比如数据库路径、密钥、日志保留天数等。
好处：以后改配置不用到处找代码，只改这一个文件就行。

类比：这就像游戏里的"设置面板"，可以调音量、画质之类的。
"""

import os

# 获取当前文件所在目录（security-platform/）
BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    """基础配置（开发和生产共用的配置）"""

    # --- 数据库配置 ---
    # SQLite 是"单文件数据库"，整个数据库就是一个 .db 文件
    # 这里放在 data/security.db（首次运行时自动创建）
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(BASE_DIR, "data", "security.db")

    # 关闭 SQLAlchemy 的修改追踪（省内存，本项目用不到）
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # --- 安全配置 ---
    # 密钥：用来签名等
    # ⚠️ 生产环境不要写死在代码里，应该从环境变量读取
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")

    # token 有效期（天）
    TOKEN_EXPIRE_DAYS = 7

    # --- 审计日志配置 ---
    # 日志保留天数：超过这个天数的日志会被 manage.py 的清理命令删掉
    # 为什么要有这个？审计表只增不减，时间久了会拖慢数据库、占用磁盘
    AUDIT_RETENTION_DAYS = 90

    # 查询日志时单页最大条数（防止一次拉太多，把内存和数据库拖死）
    AUDIT_MAX_PAGE_SIZE = 100

    # 审计日志单条 detail 字段最大长度（防止有人塞大文本进来）
    AUDIT_MAX_DETAIL_LENGTH = 1000

    # 是否信任反向代理传来的 X-Forwarded-For。
    # 默认 False：该请求头客户端可以随便伪造，直接信它会让审计 IP 失真。
    # 只有确实部署在 Nginx 等可信代理后面时，才用环境变量 TRUST_PROXY_HEADERS=1 打开。
    TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS", "0") == "1"


class DevConfig(Config):
    """开发环境配置：开启调试模式，改代码自动重启"""
    DEBUG = True


class ProdConfig(Config):
    """生产环境配置：关闭调试模式"""
    DEBUG = False


# 配置字典，方便按环境选择
config = {
    "development": DevConfig,
    "production": ProdConfig,
    "default": DevConfig,
}
