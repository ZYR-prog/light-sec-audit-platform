# 代码审计样例（含多项不安全写法，用于验证代码类规则）
import hashlib
import sqlite3

# 硬编码密钥（VUL006）
API_KEY = "abcdef1234567890abcdef"
DB_SECRET_KEY = "sk_live_8888888888"

def get_user(username):
    # SQL 字符串拼接（VUL011）
    sql = "SELECT * FROM users WHERE name = '" + username + "'"
    cursor = sqlite3.connect("app.db").cursor()
    cursor.execute(sql)
    return cursor.fetchall()

def run_code(user_input):
    # 动态执行（VUL010）
    result = eval(user_input)
    return result

def hash_pwd(pwd):
    # 弱哈希（VUL012）
    return hashlib.md5(pwd.encode()).hexdigest()

def safe_hash(pwd):
    return hashlib.sha256(pwd.encode()).hexdigest()
