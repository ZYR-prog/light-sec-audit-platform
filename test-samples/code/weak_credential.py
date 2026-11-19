# 硬编码弱口令样例（验证 VUL014）
# 用途：确认弱口令可命中，同时已脱敏值与环境变量取值不误报
# 预期结果：2 条高危（第 6、7 行）

import os

# -> VUL014（第 1 处）
DB_PASSWORD = "123456"

# -> VUL014（第 2 处）
ADMIN_PASSWORD = "admin"

# 以下不应命中：已脱敏、来自环境变量
MASKED_PASSWORD = "***"
REAL_PASSWORD = os.getenv("APP_PASSWORD")
