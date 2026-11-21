/* ============================================================
   dashboard-app.js —— 仪表盘 JS
   ============================================================ */

const $ = (id) => document.getElementById(id);

function loadScanResult() {
  return Storage.get("scanResult");
}

// ========== 核心：渲染仪表盘 ==========
function renderDashboard(result) {
  const stat = result.stat || { high: 0, mid: 0, low: 0, total: 0 };

  $("high-risk-count").textContent = stat.high;
  $("mid-risk-count").textContent = stat.mid;
  $("low-risk-count").textContent = stat.low;

  renderChart(stat);
  renderRecentList(result);
}

// ========== ② 画饼图 ==========
function renderChart(stat) {
  const canvas = $("chart-risk-distribution");

  // 强制设置高度，双保险
  canvas.style.height = "240px";
  canvas.style.width = "100%";

  if (!canvas._chartInstance) {
    canvas._chartInstance = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["高危", "中危", "低危"],
        datasets: [{
          data: [stat.high || 0, stat.mid || 0, stat.low || 0],
          backgroundColor: ["#ef4444", "#f59e0b", "#3b82f6"],
          borderWidth: 2,
          borderColor: "#1f2937"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#d1d5db" } }
        }
      }
    });
  } else {
    canvas._chartInstance.data.datasets[0].data = [
      stat.high || 0, stat.mid || 0, stat.low || 0
    ];
    canvas._chartInstance.update();
  }
}

// ========== ③ 填最近扫描历史 ==========
function renderRecentList(result) {
  const list = $("dashboard-recent-list");
  if (!result || !result.scan_meta) {
    list.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">暂无扫描记录</p>';
    return;
  }

  const meta = result.scan_meta;
  list.innerHTML = `
    <div class="flex items-center justify-between p-3 bg-gray-700 rounded">
      <div>
        <div class="font-semibold text-sm">📄 ${meta.file_name}</div>
        <div class="text-xs text-gray-400 mt-1">
          ${meta.total_lines} 行 · ${meta.rule_count} 条规则 · 耗时 ${meta.cost_ms || "—"} ms
        </div>
      </div>
      <div class="text-right">
        <div class="text-lg font-bold text-cyan-400">${result.stat.total}</div>
        <div class="text-xs text-gray-400">漏洞</div>
      </div>
    </div>
  `;
}

// ========== 初始化 ==========
document.addEventListener("DOMContentLoaded", async () => {
  // 先读 localStorage
  let savedResult = loadScanResult();

  // 如果没有（队友第一次打开），加载演示数据
  if (!savedResult) {
    try {
      const res = await fetch("../data/demo-scan-result.json");
      if (res.ok) savedResult = await res.json();
    } catch (e) { /* 演示数据也加载失败就算了 */ }
  }

  if (savedResult) {
    renderDashboard(savedResult);
  }

  window.addEventListener("scan:complete", (e) => {
    renderDashboard(e.detail);
  });
});