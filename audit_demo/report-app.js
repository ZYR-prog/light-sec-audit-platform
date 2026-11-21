/* ============================================================
   report.html 的 app.js
   ============================================================ */

// ========== 小工具函数 ==========
const $ = (id) => document.getElementById(id);

// 从 localStorage 读数据
function loadScanResult() {
    return Storage.get("scanResult");
  }

// ========== 等级颜色映射 ==========
const LEVEL_CLASS = {
  "高危": "risk-high",
  "中危": "risk-mid",
  "低危": "risk-low"
};
const LEVEL_COLOR = {
  "高危": "#ef4444",
  "中危": "#f59e0b",
  "低危": "#3b82f6"
};

// ========== 核心：生成报告 ==========
async function generateReport() {
  // 先读 localStorage
  let result = loadScanResult();

  // 如果没有，加载演示数据
  if (!result) {
    try {
      const res = await fetch("../data/demo-scan-result.json");
      if (res.ok) result = await res.json();
    } catch (e) { /* 演示数据也加载失败 */ }
  }

  const container = $("report-main-container");
  if (!result) {
    Modal.alert("尚未有扫描结果，请先到审计任务页面扫描文件", {
      title: "无法生成报告"
    });
    return;
  }
  }

  container.innerHTML = `
    ${renderHeader(result.scan_meta)}
    ${renderSummary(result.stat)}
    ${renderStats(result.scan_meta)}
    ${renderDetails(result.vul_list)}
    <div class="mt-8 pt-6 border-t border-gray-600 text-center text-gray-500 text-xs">
      本报告由 🛡️ light-sec-audit-platform 自动生成 · 生成时间：${new Date().toLocaleString("zh-CN")}
    </div>
  `;
}

// ========== 渲染区块1：项目信息段 ==========
function renderHeader(meta) {
  return `
    <div class="mb-8 pb-6 border-b border-gray-600">
      <h1 class="text-2xl font-bold text-cyan-400 mb-2">🔒 安全审计报告</h1>
      <div class="grid grid-cols-2 gap-3 text-sm mt-4">
        <div><span class="text-gray-500">被扫描文件：</span><span>${meta.file_name || "—"}</span></div>
        <div><span class="text-gray-500">扫描时间：</span><span>${meta.scan_time || new Date().toLocaleString("zh-CN")}</span></div>
        <div><span class="text-gray-500">工具版本：</span><span>light-sec-audit-platform v1.0</span></div>
        <div><span class="text-gray-500">扫描耗时：</span><span>${meta.cost_ms || "—"} ms</span></div>
      </div>
    </div>
  `;
}

// ========== 渲染区块2：风险汇总 ==========
function renderSummary(stat) {
  const total = stat.total || 0;
  const items = [
    { level: "高危", count: stat.high, color: "#ef4444" },
    { level: "中危", count: stat.mid, color: "#f59e0b" },
    { level: "低危", count: stat.low, color: "#3b82f6" }
  ];

  const progressBars = items.map(item => {
    const pct = total > 0 ? (item.count / total * 100).toFixed(0) : 0;
    return `
      <div class="mb-2">
        <div class="flex justify-between text-sm mb-1">
          <span><span style="color:${item.color}">●</span> ${item.level}</span>
          <span>${item.count} 条 (${pct}%)</span>
        </div>
        <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full rounded-full" style="width:${pct}%; background:${item.color};"></div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="mb-8 pb-6 border-b border-gray-600">
      <h2 class="text-lg font-bold mb-4">📊 风险汇总统计</h2>
      <div class="grid grid-cols-4 gap-4 mb-4">
        <div class="text-center p-4 bg-gray-700 rounded">
          <div class="text-3xl font-bold text-cyan-400">${total}</div>
          <div class="text-xs text-gray-400">漏洞总数</div>
        </div>
        <div class="text-center p-4 bg-gray-700 rounded">
          <div class="text-3xl font-bold" style="color:#ef4444">${stat.high || 0}</div>
          <div class="text-xs text-gray-400">高危</div>
        </div>
        <div class="text-center p-4 bg-gray-700 rounded">
          <div class="text-3xl font-bold" style="color:#f59e0b">${stat.mid || 0}</div>
          <div class="text-xs text-gray-400">中危</div>
        </div>
        <div class="text-center p-4 bg-gray-700 rounded">
          <div class="text-3xl font-bold" style="color:#3b82f6">${stat.low || 0}</div>
          <div class="text-xs text-gray-400">低危</div>
        </div>
      </div>
      ${progressBars}
    </div>
  `;
}

// ========== 渲染区块3：统计数据 ==========
function renderStats(meta) {
  return `
    <div class="mb-8 pb-6 border-b border-gray-600">
      <h2 class="text-lg font-bold mb-4">📈 扫描统计</h2>
      <div class="grid grid-cols-3 gap-4">
        <div class="p-3 bg-gray-700 rounded text-center">
          <div class="text-xl font-bold">${meta.total_lines || 0}</div>
          <div class="text-xs text-gray-400">文件总行数</div>
        </div>
        <div class="p-3 bg-gray-700 rounded text-center">
          <div class="text-xl font-bold">${meta.rule_count || 0}</div>
          <div class="text-xs text-gray-400">参与匹配规则数</div>
        </div>
        <div class="p-3 bg-gray-700 rounded text-center">
          <div class="text-xl font-bold">${meta.rule_error_count || 0}</div>
          <div class="text-xs text-gray-400">规则错误数</div>
        </div>
      </div>
    </div>
  `;
}

// ========== 渲染区块4：漏洞详情 ==========
function renderDetails(vulList) {
  if (!vulList || vulList.length === 0) {
    return `
      <div class="mb-8">
        <h2 class="text-lg font-bold mb-4">🔍 漏洞详情</h2>
        <div class="text-center text-gray-500 py-8">✅ 未检出任何风险项</div>
      </div>
    `;
  }

  const levelOrder = { "高危": 0, "中危": 1, "低危": 2 };
  const sorted = [...vulList].sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  const items = sorted.map((v, idx) => {
    const badgeClass = LEVEL_CLASS[v.level] || "risk-low";
    return `
      <div class="mb-6 p-5 bg-gray-700 rounded border-l-4" style="border-left-color:${LEVEL_COLOR[v.level]}">
        <div class="flex items-start justify-between mb-3">
          <div>
            <h3 class="font-bold text-base">
              <span class="text-gray-500 text-sm mr-2">#${idx + 1}</span>
              ${v.vname}
            </h3>
            <span class="text-xs text-gray-400">漏洞编号：${v.vid}</span>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-bold text-white" style="background:${LEVEL_COLOR[v.level]}">
            ${v.level}
          </span>
        </div>
        <div class="space-y-2 text-sm">
          <div><span class="text-gray-400">位置：</span>${v.file_name} · 第 ${v.line} 行</div>
          <div><span class="text-gray-400">命中内容：</span><code class="bg-gray-900 px-2 py-1 rounded text-cyan-300">${v.hit_content}</code></div>
          <div><span class="text-gray-400">漏洞原理：</span>${v.description}</div>
          <div><span class="text-gray-400">修复建议：</span><span class="text-green-400">${v.suggestion}</span></div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="mb-4">
      <h2 class="text-lg font-bold mb-4">🔍 漏洞详情（共 ${sorted.length} 项，按风险等级排序）</h2>
      ${items}
    </div>
  `;
}

// ========== 按钮绑定（等 DOM 加载完再绑） ==========
document.addEventListener("DOMContentLoaded", () => {
  $("report-generate-btn").addEventListener("click", generateReport);
  $("report-print-btn").addEventListener("click", () => {
    const container = $("report-main-container");
    if (container.innerHTML.includes("尚未生成报告")) {
      Modal.alert("请先生成报告再打印", { title: "无法打印" });
      return;
    }
    window.print();
  });
});