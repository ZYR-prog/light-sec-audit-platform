# 给队友A 的接入说明（改 3 个地方就能跑通）

> 发件人：成员B
> 前提：`js/core/scan.js`、`js/core/data-schema.js`、`data/vulnerabilities.json` 已经放进项目里了
> 你只需要动 `js/pages/audit-task.js` 和审计任务页的 html

---

## 改动 ①：写 `js/core/file-reader.js`（这个按规范归你）

```js
// js/core/file-reader.js
/**
 * 把用户选的 File 读成字符串。B 的 scan.js 只吃字符串，不碰 File 对象。
 */
export function readFileAsText(file, encoding = "utf-8") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file, encoding);
  });
}
```

---

## 改动 ②：在 `js/pages/audit-task.js` 里调扫描接口

```js
import { scanText, summarize } from "../core/scan.js";
import { LEVEL_CLASS } from "../core/data-schema.js";
import { readFileAsText } from "../core/file-reader.js";

const $ = (id) => document.getElementById(id);

async function handleFile(file) {
  if (!file) return;
  $("scan-status-tip").textContent = `正在扫描 ${file.name} …`;
  $("scan-progress-bar").style.width = "30%";

  try {
    const text   = await readFileAsText(file);          // 你负责读
    const result = await scanText(text, file.name);      // ★ B 负责扫，就这一句

    renderTable(result);                                 // 你负责渲染
    updateCards(result.stat);
    $("scan-progress-bar").style.width = "100%";
    $("scan-status-tip").textContent = `扫描完成：${result.scan_meta.file_name} ｜ ${summarize(result)}`;

    // ★ 广播事件：仪表盘和你自己都能监听，C 也靠它入库
    window.dispatchEvent(new CustomEvent("scan:complete", { detail: result }));
  } catch (err) {
    $("scan-progress-bar").style.width = "0%";
    $("scan-status-tip").textContent = `扫描失败：${err.message}`;
    console.error(err);
  }
}
```

### 表格渲染（6 列：# / 名称 / 等级 / 位置 / 描述 / 操作）

```js
function renderTable(result) {
  const tbody = $("result-table-body");
  tbody.innerHTML = "";

  if (result.vul_list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">未检出风险项</td></tr>';
    return;
  }

  result.vul_list.forEach((v, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${idx + 1}</td>` +
      `<td>${v.vname}</td>` +
      `<td><span class="badge ${LEVEL_CLASS[v.level]}">${v.level}</span></td>` +
      `<td>第 ${v.line} 行</td>` +
      `<td>${v.description}</td>` +
      `<td><button class="btn-mini" data-idx="${idx}">详情</button></td>`;
    tbody.appendChild(tr);
  });
}
```

> 等级徽章的 CSS（在 `css/components.css` 里加）：

```css
.badge { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 700; color: #fff; }
.risk-high { background: #ef4444; }
.risk-mid  { background: #f59e0b; }
.risk-low  { background: #3b82f6; }
```

---

## 改动 ③：按钮绑定 + 仪表盘监听

```js
// 审计任务页：按钮 → 触发隐藏的文件框
$("scan-start-btn").addEventListener("click", () => $("upload-file-input").click());
$("upload-file-input").addEventListener("change", (e) => handleFile(e.target.files[0]));

// 仪表盘（dashboard.js 里）：监听扫描完成事件
window.addEventListener("scan:complete", (e) => {
  const { stat, vul_list } = e.detail;
  document.getElementById("high-risk-count").textContent = stat.high;
  document.getElementById("mid-risk-count").textContent  = stat.mid;
  document.getElementById("low-risk-count").textContent  = stat.low;
  // 饼图：把 stat 转成 [stat.high, stat.mid, stat.low]，配 LEVEL_COLOR 的三种颜色
});
```

---

## ⚠️ 三个必须注意的点

### 1. 按钮绑定只能你写，B 不写

B 的 `scan.js` **完全不碰 DOM**。如果两边都绑 `scan-start-btn` 的 click，**点一次会弹两个文件选择框**。

### 2. 必须用 http 打开

`data/vulnerabilities.json` 是通过 `fetch` 加载的。双击 html 用 `file://` 打开会报：

```
fetch ... 404 / CORS policy
```

→ 用 Live Server 或 `python -m http.server 8000`。

### 3. 页面里加载的 script 必须是 module

```html
<script type="module" src="js/pages/audit-task.js"></script>
```

漏了 `type="module"` 会报 `Cannot use import statement outside a module`。

---

## ✅ 验收清单（4 条都过才算通）

| # | 操作 | 期望 |
|---|---|---|
| 1 | F12 打开控制台，刷新页面 | 无红色报错 |
| 2 | 点「选择文件并开始扫描」 | 只弹一个文件选择框 |
| 3 | 选 `test-samples/configs/sshd_bad.conf` | 表格 3 行，全「高危」，位置为第 9/10/11 行 |
| 4 | 切到仪表盘 | 三卡片 3 / 0 / 0 |

---

## 🔧 报错对照表

| 控制台报错 | 原因 | 修法 |
|---|---|---|
| `Failed to load module script ... 404` | `js/core/scan.js` 路径不对 | 确认 `audit-task.js` 里是 `../core/scan.js` |
| `fetch 404 ... vulnerabilities.json` | `data/` 不在项目根，或用了 file:// | 确认 `data/` 与 `js/` 同级；改用 http |
| `Cannot use import statement outside a module` | script 缺 `type="module"` | 补上 |
| `Cannot read properties of null (reading 'addEventListener')` | 页面里没有该 id | 核对 `upload-file-input` / `scan-start-btn` 拼写 |
| `待扫描内容为空` | 文件读出来是空串 | 检查 `file-reader.js` 的 `readAsText` |
| 表格空、无报错 | `result-table-body` 不是 tbody | 改成 `<tbody id="result-table-body">` |

---

## 📎 联调参考页

`test-samples/mock-a-page.html` 是一个**已经跑通的完整示例**，id 和你页面完全一致。
如果某个地方卡住，直接打开它对比代码，或者把里面 `<script type="module">` 的内容整段搬到 `audit-task.js`。

跑法：

```bash
python -m http.server 8000
# 浏览器打开 http://127.0.0.1:8000/test-samples/mock-a-page.html
```
