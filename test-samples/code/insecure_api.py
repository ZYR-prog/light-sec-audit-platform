# 不安全的接口/数据用法样例（验证 VUL015 / VUL016 / VUL017 / VUL018）
# 用途：确认命令执行、不安全反序列化、异常详情外泄、明文连接串四类规则可命中
# 预期结果：6 条（高危 4 / 中危 1 / 低危 1）

import os
import pickle
import subprocess
import traceback
import yaml


# -> VUL015 命令执行（第 1 处）
def ping(host):
    os.system("ping -c 1 " + host)


# -> VUL015 命令执行（第 2 处，shell=True）
def run_cmd(cmd):
    subprocess.run(cmd, shell=True)


# -> VUL016 不安全反序列化（第 1 处）
def load_data(blob):
    return pickle.loads(blob)


# -> VUL016 不安全反序列化（第 2 处，yaml.load 未指定 Loader）
def load_cfg(path):
    with open(path, encoding="utf-8") as f:
        return yaml.load(f)


# -> VUL017 异常详情外泄
def handle():
    try:
        pass
    except Exception:
        traceback.print_exc()


# -> VUL018 数据库连接串含明文口令
DB_URL = "mysql://root:P@ssw0rd@10.0.0.5:3306/app"
