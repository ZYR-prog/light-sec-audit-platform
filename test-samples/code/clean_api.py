# 安全写法对照样例（验证新增规则零误报）
# 用途：全部采用安全写法，扫描结果必须为 0 条（真阴性）
# 预期结果：0 条

import os
import subprocess
import yaml
import bcrypt


# 安全：参数列表调用，不使用 shell=True
def ping_safe(host):
    subprocess.run(["ping", "-c", "1", host])


# 安全：使用 safe_load
def load_cfg_safe(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


# 安全：yaml.load 显式指定 SafeLoader（应被排除规则放行）
def load_cfg_safe2(path):
    with open(path, encoding="utf-8") as f:
        return yaml.load(f, Loader=yaml.SafeLoader)


# 安全：口令来自环境变量，连接串中不含「账号:口令@」
def build_url():
    host = os.environ.get("DB_HOST", "10.0.0.5")
    return f"mysql://app@{host}:3306/app"


# 安全：强哈希 + 加盐
def hash_pwd(pwd):
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt())
