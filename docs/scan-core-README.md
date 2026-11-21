# scan-core 扫描模块说明（成员B 产出）

> 位置：`js/core/scan.js` + `js/core/data-schema.js` + `data/vulnerabilities.json`
> 一句话：拿一段文件文本，按漏洞规则库逐行正则匹配，输出标准化漏洞结果。

---

## 一、是什么 / 不是什么

| | 说明 |
|---|---|
| ✅ **是** | 纯前端 JS 模块，在浏览器里跑，用**正则特征匹配**找漏洞 |
| ✅ **是** | 输入：文件全文文本 + 规则库；输出：漏洞清单 + 分项统计 + 扫描元信息 |
| ✅ **是** | 纯逻辑，不碰 DOM，可脱离页面单独测试（`node test-samples/selftest.mjs`） |
| ❌ **不是** | 不是网络扫描器，不会向任何服务器发包 |
| ❌ **不是** | 不是 AI / 语义分析，就是关键词 + 正则 |
| ❌ **不是** | 不读文件（A 的 `file-reader.js` 负责）、不渲染页面（A 的 `pages/audit-task.js` 负责）、不存库（C 的 `api/history.js` 负责） |

**为什么坚持纯前端**：用户上传的日志/配置**不离开本机**，符合"敏感文件不出本地"的安全要求，也让整个平台可以做静态部署。

---

## 二、我在团队目录里的位置

```
项目根/
├── data/
│   ├── vulnerabilities.json      ← B：12 条漏洞规则库
│   ├── scan-rules.md             ← B：每条规则的正则说明
│   ├── baseline.json             ← A：安全基线库
│   └── report-template.json      ← A：报告模板
├── js/core/
│   ├── file-reader.js            ← A 写，B 调用（把 File 读成字符串）
│   ├── scan.js                   ★ B：核心扫描算法 + 对外接口
│   └── data-schema.js            ★ B：扫描结果数据结构定义
├── js/pages/
│   └── audit-task.js             ← A：调 scanText()、填表格、绑按钮
└── test-samples/                 ★ B：测试样例 + 回归脚本
    ├── logs/{vulnerable,clean}/
    ├── configs/
    ├── code/
    ├── selftest.mjs
    └── mock-a-page.html
```

---

## 三、对外接口（A / C 只看这一节）

### 3.1 主接口：`scanText`

```js
import { scanText, summarize } from "./js/core/scan.js";

const fileText = await readFileAsText(file);        // A 的 file-reader.js
const result   = await scanText(fileText, file.name); // ★ 核心就这一句

result.vul_list;    // 漏洞明细数组
result.stat;        // { high, mid, low, total }
result.scan_meta;   // { file_name, total_lines, rule_count, rule_error_count, cost_ms, scan_time }
summarize(result);  // "检出 3 条风险（高危 3 / 中危 0 / 低危 0）"
```

### 3.2 其他导出

| 导出 | 用途 |
|---|---|
| `getRules()` | 拿规则库（带缓存，只请求一次） |
| `preloadRules()` | 页面启动时预加载，避免首次扫描卡顿 |
| `clearRulesCache()` | 改了规则库想立即生效时调用 |
| `startScan(text, rules, {fileName})` | 同步版核心函数（规则已就绪时用，测试脚本用它） |
| `summarize(result)` / `summaryOf` | 一句话结论 |
| `RULES_URL` | 规则库的绝对地址（排错时打印用） |

### 3.3 数据结构定义（`data-schema.js`）

```js
import { LEVEL, LEVEL_LIST, LEVEL_CLASS, LEVEL_COLOR, VUL_FIELDS, validateResult } from "./js/core/data-schema.js";
```

| 导出 | 内容 |
|---|---|
| `LEVEL` | `{ HIGH: "高危", MID: "中危", LOW: "低危" }` |
| `LEVEL_LIST` | `["高危","中危","低危"]`（固定展示顺序） |
| `LEVEL_CLASS` | 等级 → 徽章类名 `risk-high / risk-mid / risk-low` |
| `LEVEL_COLOR` | 等级 → 颜色 `#ef4444 / #f59e0b / #3b82f6`（给饼图） |
| `VUL_FIELDS` | 漏洞条目的 8 个字段名 |
| `validateResult(result)` | 开发期自检，返回错误数组，空数组=合规 |

---

## 四、输出数据结构（全队统一，字段名不许改）

```json
{
  "vul_list": [
    {
      "vid": "VUL001",
      "vname": "SSH 开启密码登录认证",
      "level": "高危",
      "line": 9,
      "hit_content": "PasswordAuthentication yes",
      "description": "SSH 服务开启密码认证，攻击者可暴力猜解口令。",
      "suggestion": "改为 PasswordAuthentication no，改用密钥登录。",
      "file_name": "sshd_bad.conf"
    }
  ],
  "stat": { "high": 1, "mid": 0, "low": 0, "total": 1 },
  "scan_meta": {
    "file_name": "sshd_bad.conf",
    "total_lines": 16,
    "rule_count": 12,
    "rule_error_count": 0,
    "cost_ms": 2,
    "scan_time": "2026-11-17T12:00:00.000Z"
  }
}
```

---

## 五、扫描完成事件（A 更新仪表盘 / C 入库）

```js
window.addEventListener("scan:complete", (e) => {
  const { vul_list, stat, scan_meta } = e.detail;
  // A：更新 high-risk-count / mid-risk-count / low-risk-count、刷新饼图
  // C：POST 到后端存审计任务 + 写操作留痕（用 scan_meta.scan_time / cost_ms / total_lines）
});
```

> 事件由 `pages/audit-task.js`（A）在扫描成功后派发，`scan.js` 本身不派发，保持纯逻辑。

---

## 六、三种跑法

| 场景 | 命令 | 结果 |
|---|---|---|
| 命令行回归测试 | `node test-samples/selftest.mjs` | **7/7 通过** |
| 浏览器联调预演 | `python -m http.server 8000` → 打开 `/test-samples/mock-a-page.html` | 选 sshd_bad.conf 出 3 行、卡片 3/0/0 |
| 正式页面 | A 的 `index.html` / 审计任务页 | 同上 |

> 浏览器端**必须用 http 打开**，`file://` 双击会因 CORS 读不到规则库。

---

## 七、测试结果（摘要）

| 用例 | 期望 | 实际 |
|---|---|---|
| configs/sshd_bad.conf | 3 条高危（第 9/10/11 行） | ✅ |
| configs/sshd_good.conf | 0 条 | ✅ |
| configs/sshd_comment.conf | 0 条（全在注释里） | ✅ |
| logs/vulnerable/demo_log.txt | 1 条中危（第 1 行） | ✅ |
| logs/clean/ssh_login_normal.log | 0 条（误报测试） | ✅ |
| configs/web_config.ini | 4 条（中 3 / 低 1） | ✅ |
| code/app.py | 5 条（高 2 / 中 2 / 低 1） | ✅ |

**7/7 通过。** 详细记录见 `docs/测试记录.md`。

---

## 八、已知局限（答辩时主动说，比被问出来好）

1. **只做正则特征匹配**，不做语义分析 → 变形写法的漏洞可能漏报
2. **单文件扫描**，不跨文件关联（比如 config 引用的证书文件）
3. **规则库 12 条**，覆盖面有限，后续可持续扩展（维护流程见 `data/scan-rules.md`）
4. **未做二进制/超大文件优化**，1MB 以上文件未压测
5. **编码假设 UTF-8**，GBK 文件的中文可能匹配异常

---

## 九、踩过的坑（写给以后的自己）

| 坑 | 现象 | 解决 |
|---|---|---|
| 正则 `***` | 规则静默失效，一条都扫不出 | 用 `\*{3}` 转义，并加回归测试兜底 |
| `fetch("./x.json")` | 页面挪到根目录后 404 | 改用 `new URL(..., import.meta.url)` |
| 正则带 `g` 标志 | 偶发漏报（lastIndex 跳动） | 编译时统一去掉 `g` / `y` |
| 一条规则写错 | 整个扫描崩掉 | try/catch 单条跳过 + `rule_error_count` 记录 |
