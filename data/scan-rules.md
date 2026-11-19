# scan-rules.md — 漏洞匹配规则说明文档

> 本文档是 `vulnerabilities.json` 的**人类可读版本**，逐条说明每一条漏洞的判定逻辑、正则含义与误报排除条件。
> `vulnerabilities.json` 给程序 `scan.js` 读；本文档给人（老师/评审/队友）读。
> 两边的 `vid` 与规则必须一一对应，改了一边要同步改另一边。

---

## 一、规则的通用约定

### 1. 字段说明

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `vid` | ✅ | 漏洞唯一编号，不可重复，如 `VUL001` |
| `vname` | ✅ | 漏洞名称，展示在漏洞表格第一列 |
| `level` | ✅ | 风险等级，**只允许填 `高危` / `中危` / `低危`**（写别的会导致统计不进去） |
| `pattern` | ✅ | 命中漏洞特征的正则表达式 |
| `exclude_pattern` | ⭕ | 误报排除正则，**只要这一行命中它，就不判定为漏洞**；可用 `\|` 拼多个排除分支 |
| `flags` | ⭕ | 正则标志，默认 `i`（忽略大小写）；不要写 `g` / `y` |
| `description` | ✅ | 漏洞原理与风险说明 |
| `target_file` | ✅ | 适用文件类型，数组，仅作提示，不做强制过滤 |
| `suggestion` | ✅ | 整改建议 |

### 2. 匹配流程（scan.js 内部逻辑）

```
对每一行文本：
  ① 空行 → 跳过
  ② 命中 exclude_pattern → 跳过（不算漏洞）
  ③ 命中 pattern      → 记一条漏洞（记录行号 + 命中内容）
  ④ 都不命中           → 跳过
```

### 3. 注释行统一排除

所有规则共用同一条注释排除分支：`^[\s]*(#|//|;|--)`

| 注释符号 | 适用场景 |
|---|---|
| `#` | Linux 配置（sshd_config）、Python、Shell |
| `//` | C/C++/Java/JS 代码 |
| `;` | ini 配置文件 |
| `--` | SQL 脚本 |

> ⚠️ 注意局限：目前只能排除**整行注释**。像 `PasswordAuthentication yes  # 临时开启` 这种"行尾注释"仍会被判为漏洞。若要处理，需要引入更复杂的语法分析，属于本期不作要求的内容。

### 4. JSON 里写正则的两个坑

1. **反斜杠要双写**：正则里写 `\s+`，在 JSON 里要写成 `\\s+`。
2. **`*` 是量词**：想匹配字面上的星号 `***`，必须写 `\\*{3}`，直接写 `***` 会构造出非法正则（`Nothing to repeat` 报错）。

---

## 二、逐条规则说明

### VUL001 SSH 开启密码登录认证 ｜ 高危
- **目标特征**：`PasswordAuthentication yes`
- **正则**：`PasswordAuthentication\\s+yes`
  - `\\s+` 兼容 `PasswordAuthentication    yes` 这类多空格写法
- **排除**：注释行 `#PasswordAuthentication yes` 属于历史残留，不判漏洞
- **适用**：`sshd_config` 等 Linux 配置

### VUL002 日志中记录明文密码 ｜ 中危
- **目标特征**：`password=xxx` / `password: xxx`
- **正则**：`password\\s*[=:]\\s*[^\\s\\"']{3,}`
  - `[=:]` 兼容等号和冒号两种赋值写法
  - `[^\\s\\"']{3,}` 表示取后面连续的非空白、非引号字符，且长度 ≥ 3（排除 `password=` 后面为空的情况）
- **排除**：
  - 注释行
  - **已脱敏的内容**：`password=***`、`password=[masked]`、`password=[脱敏]`
- **适用**：应用运行日志

### VUL003 Web 服务开启 Debug 调试模式 ｜ 中危
- **目标特征**：`debug = true` / `debug: 1` / `debug = on`
- **正则**：`debug\\s*[:=]\\s*(true|1|on)`
- **排除**：注释行
- **适用**：Web 配置文件、应用配置

### VUL004 允许 root 账号直接远程登录 ｜ 高危
- **目标特征**：`PermitRootLogin yes`
- **正则**：`PermitRootLogin\\s+yes`
- **排除**：注释行
- **说明**：`no`、`prohibit-password`、`without-password` 均为安全值，不会被匹配

### VUL005 允许空口令登录 ｜ 高危
- **目标特征**：`PermitEmptyPasswords yes`
- **正则**：`PermitEmptyPasswords\\s+yes`
- **排除**：注释行

### VUL006 配置文件硬编码密钥 ｜ 高危
- **目标特征**：`api_key = "xxxxxxxx"` / `secret_key: "..."` / `access-key=...`
- **正则**：`(api[_-]?key|secret[_-]?key|access[_-]?key|private[_-]?key)\\s*[=:]\\s*[\\"']?[A-Za-z0-9/+_-]{12,}`
  - `[_-]?` 兼容 `api_key` / `api-key` / `apikey` 三种写法
  - `{12,}` 要求密钥长度 ≥ 12，避免把 `api_key = ""` 或短占位符误报
- **排除**：
  - 注释行
  - 占位符值：`xxx`、`***`、`your`、`空`、`示例`（这类是模板占位，不是真密钥）
- **适用**：配置文件、源代码

### VUL007 Web 服务开启目录浏览 ｜ 中危
- **目标特征**：`Options +Indexes`、`Options Indexes FollowSymLinks`
- **正则**：`Options\\s+[^\\n]*\\bIndexes\\b`
- **排除**：
  - 注释行
  - **已修正的写法**：`Options -Indexes`（前面带减号表示关闭，不是漏洞）
- **适用**：Apache 等 Web 配置

### VUL008 启用 TRACE 等危险 HTTP 方法 ｜ 低危
- **目标特征**：`TraceEnable On`
- **正则**：`TraceEnable\\s+On`
- **排除**：注释行；`Off` 不匹配

### VUL009 HTTPS / SSL 被关闭 ｜ 中危
- **目标特征**：`ssl = false` / `ssl: off` / `SSLEnabled = false`
- **正则**：`(ssl\\s*[:=]\\s*(false|off))|(SSLEnabled\\s*=\\s*false)`
- **排除**：注释行

### VUL010 代码中使用 eval 动态执行 ｜ 中危
- **目标特征**：`eval(` 函数调用
- **正则**：`\\beval\\s*\\(`
  - `\\b` 单词边界，避免匹配到 `retrieval(`、`myeval(` 这类标识符
- **排除**：注释行
- **适用**：源代码（JS / Python / PHP）

### VUL011 SQL 语句字符串拼接 ｜ 中危
- **目标特征**：`"SELECT ... WHERE id = " + userId`
- **正则**：`(select|insert|update|delete)[^;\\n]*\\+\\s*[A-Za-z_$@]`
  - `[^;\\n]*` 限制在同一行、同一条语句内匹配，避免跨行误报
  - `\\+\\s*[A-Za-z_$@]` 表示后面跟着变量（字母、`$`、`@` 开头）
- **排除**：注释行
- **适用**：源代码
- **局限**：若使用模板字符串拼接（`f"SELECT ... {uid}"`）则无法命中，需要后续扩展规则

### VUL012 使用 MD5 等弱哈希算法 ｜ 低危
- **目标特征**：`md5(`、`sha1(`
- **正则**：`\\b(md5|sha1)\\s*\\(`
- **排除**：注释行
- **适用**：源代码

---

## 二之二、第二批规则（VUL013 ~ VUL018，规则扩容）

> 扩库目标：覆盖「协议配置 / 凭据 / 代码执行 / 反序列化 / 信息泄露 / 连接串」6 类高频风险，把规则总数从 12 条提到 **18 条**。
> 每条都配了**正例**与**反例**，见 `test-samples/` 与 `selftest.mjs` 的后 5 个用例。

### VUL013 启用不安全的 SSH 协议版本 1 ｜ 高危
- **目标特征**：`Protocol 1`
- **正则**：`^[\s]*Protocol\s+[^\n]*\b1\b`
  - `^[\s]*` 允许行首缩进（部分配置有前导空格）
  - `[^\n]*\b1\b` 兼容 `Protocol 1,2` 这种"降级但仍启用 1"的写法
- **排除**：注释行（`#Protocol 1` 不算）
- **适用**：sshd_config / Linux 配置
- **为什么高危**：协议 1 的密钥交换与完整性校验机制有设计缺陷，已被 RFC 4253 废弃，可被中间人与降级攻击利用。

### VUL014 配置或代码中硬编码弱口令 ｜ 高危
- **目标特征**：`password = "123456"` 这类**带引号的**弱口令赋值
- **正则**：`(password|passwd|pwd)\s*[=:]\s*[\"'](123456|12345678|111111|888888|admin|root|qwerty|abc123|password|admin123|test123)[\"']`
  - 弱口令清单只放最典型的 10 个，避免误报面扩大
  - 要求值被引号包裹，避免与日志中的 `password=Admin@123`（无引号）重复命中
- **排除**：注释行；已脱敏标记（`***`、`xxx`、`your`、`placeholder`）
- **适用**：配置文件 / 源代码
- **局限**：强口令硬编码（如 `password="A8f#2kL"`）不在此规则范围，由 VUL018（连接串）与 VUL006（密钥）分担。

### VUL015 代码中直接执行系统命令 ｜ 高危
- **目标特征**：`os.system(`、`os.popen(`、`shell_exec(`、`passthru(`、`Runtime.getRuntime().exec(`、`subprocess.run(..., shell=True)`
- **正则**：`(os\.system\s*\(|os\.popen\s*\(|shell_exec\s*\(|passthru\s*\(|Runtime\.getRuntime\(\)\.exec\s*\(|subprocess\.(call|run|Popen)\s*\([^)]*shell\s*=\s*True)`
- **排除**：注释行
- **适用**：源代码
- **为什么单独列**：`subprocess.run([...])` 参数列表调用是安全的（无 shell 解析），只有 `shell=True` 才危险，因此精确到 `shell=True` 分支，避免把安全工作流误报。
- **局限**：命令字符串被拆成多行拼接时不命中（逐行匹配的固有约束）。

### VUL016 不安全的反序列化 ｜ 高危
- **目标特征**：`pickle.loads(`、`cPickle.loads(`、`marshal.loads(`、`yaml.load(`、`XMLDecoder`
- **正则**：`(pickle\.loads\s*\(|cPickle\.loads\s*\(|marshal\.loads\s*\(|yaml\.load\s*\(|XMLDecoder)`
- **排除**：注释行；`yaml.load(...)` 中显式指定 `Loader=` 的写法（如 `Loader=yaml.SafeLoader`）
- **适用**：源代码
- **注意**：`yaml.safe_load(` 的字符串里不含 `.load(` 子串，因此天然不命中，无需额外排除。

### VUL017 异常详情直接输出 ｜ 低危
- **目标特征**：`traceback.print_exc(`、`traceback.format_exc(`、`printStackTrace(`、`die(mysqli_error`
- **正则**：`(traceback\.print_exc\s*\(|traceback\.format_exc\(|printStackTrace\s*\(|die\s*\(\s*mysqli_error)`
- **排除**：注释行
- **适用**：源代码 / 应用日志
- **为什么定低危**：不直接造成执行，但会暴露源码路径、函数名、SQL 结构，是攻击者的信息收集入口，与 VUL003（Debug 模式）互为补充。

### VUL018 数据库连接串含明文密码 ｜ 中危
- **目标特征**：`mysql://root:P@ssw0rd@10.0.0.5:3306/app` 这类带账号口令的 DSN
- **正则**：`(mysql|postgresql|postgres|mongodb|redis|mssql)\S*://[^:/@\s]+:[^@\s/]+@`
  - 前半段 `[^:/@\s]+` 是用户名
  - 后半段 `[^@\s/]+` 是口令（允许含 `@`、不允许含空白和 `/`）
- **排除**：注释行；口令位为 `***` / `xxx` / `your` / `<...>` / `${ENV}` 的写法
- **适用**：配置文件 / 源代码
- **零误报设计**：`mysql://app@host/db`（不含冒号口令）不会被命中，见 `test-samples/code/clean_api.py`。

---

## 三、规则维护流程（新增一条漏洞时按这个走）

1. 在 `vulnerabilities.json` 里追加一条规则，`vid` 顺延（当前已用到 `VUL018`，下一条从 `VUL019` 开始）
2. **先去 regex101.com 单独测这条 `pattern`**，确认：
   - 该命中的都能命中（不漏报）
   - 不该命中的不会命中（不误报）
3. 在本文档补一条对应说明
4. 在 `test-samples/` 里补一份样例文件（含漏洞的 + 干净的各一份）
5. 到 `selftest.mjs` 的 `cases` 数组里加一条期望结果
6. 运行 `node test-samples/selftest.mjs`，确认 **12/12 全部通过**（当前基线）

> 这个流程就是"规则库 → 测试样例 → 自动化回归"的闭环，也是交付物里「阶段性测试」的证据。

