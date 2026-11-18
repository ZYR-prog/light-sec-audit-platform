/* =========================================================
 * 🛡️ 安全审计平台 — 统一 JS 入口（队友改这里）
 *
 * 五个页面共用这一个 JS 文件
 * 队友看到页面里的 id → 在下面对应的模块里写代码
 * ========================================================= */

// ==========================================
// 📌 队友专用工具：找到页面上的元素
// ==========================================
const $ = (id) => document.getElementById(id);

// ==========================================
// 📊 仪表盘（index.html）
// 用到的 id: high-risk-count / mid-risk-count / low-risk-count
//           chart-risk-distribution / dashboard-recent-list
// ==========================================
(function dashboard() {
  // 如果不是仪表盘页面就跳过
  if (!$('high-risk-count')) return;

  console.log('[仪表盘] JS 已加载');

  // 队友在这里写：
  // 1. 数字填充: $('high-risk-count').textContent = 3
  // 2. Chart.js 图表
  // 3. 最近扫描列表渲染
})();

// ==========================================
// 🔍 审计任务（scan.html）
// 用到的 id: upload-file-input / scan-start-btn
//           scan-progress-bar / scan-status-tip
//           result-table-body
// ==========================================
(function scan() {
  if (!$('scan-start-btn')) return;

  console.log('[审计任务] JS 已加载');

  // 队友在这里写：
  // 1. 文件上传逻辑
  // 2. 扫描按钮 onclick
  // 3. 进度条更新
  // 4. 结果表格渲染
})();

// ==========================================
// 📋 安全基线库（baseline.html）
// 用到的 id: baseline-search-input / baseline-container
// ==========================================
(function baseline() {
  if (!$('baseline-container')) return;

  console.log('[基线库] JS 已加载');

  // 队友在这里写：
  // 1. 基线列表加载
  // 2. 搜索过滤
})();

// ==========================================
// 📑 审计报告（report.html）
// 用到的 id: report-generate-btn / report-print-btn / report-main-container
// ==========================================
(function report() {
  if (!$('report-generate-btn')) return;

  console.log('[审计报告] JS 已加载');

  // 队友在这里写：
  // 1. 生成报告
  // 2. 打印
})();

// ==========================================
// ❓ 帮助/关于（help.html）— 纯静态，不用写
// ==========================================