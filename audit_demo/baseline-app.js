/* ============================================================
   baseline-app.js —— 安全基线库 JS
   ============================================================ */

const $ = (id) => document.getElementById(id);
let allBaselines = [];

async function loadBaselines() {
  try {
   const response = await fetch("data/baseline.json"); 
    if (!response.ok) throw new Error("加载失败 status=" + response.status);
    allBaselines = await response.json();
    renderList(allBaselines);
  } catch (err) {
    $("baseline-container").innerHTML = `
      <div class="text-center text-gray-500 py-10">
        <p>⚠️ 基线库加载失败：${err.message}</p>
      </div>`;
  }
}

function renderList(list) {
  const container = $("baseline-container");
  if (!list.length) {
    container.innerHTML = '<div class="text-center text-gray-500 py-10">暂无匹配的基线规则</div>';
    return;
  }
  const grouped = {};
  list.forEach(b => {
    if (!grouped[b.category]) grouped[b.category] = [];
    grouped[b.category].push(b);
  });
  container.innerHTML = Object.entries(grouped).map(([cat, items]) => `
    <div class="pb-4 mb-4 border-b border-gray-700 last:border-0">
      <h4 class="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
        📁 ${cat} <span class="text-xs text-gray-500">(${items.length} 条)</span>
      </h4>
      ${items.map(b => `
        <div class="bg-gray-700 rounded p-3 mb-2 hover:bg-gray-600 transition">
          <div class="flex items-center gap-2 mb-1">
            <code class="text-xs text-gray-400">${b.bid}</code>
            <span class="text-gray-100 font-medium text-sm">${b.name}</span>
            <span class="badge risk-${b.level === '高危' ? 'high' : b.level === '中危' ? 'mid' : 'low'}">${b.level}</span>
          </div>
          <p class="text-xs text-gray-400 mb-2">${b.description}</p>
          <div class="flex items-center gap-3 text-xs">
            <span class="text-cyan-300">✅ 标准：<code class="bg-gray-800 px-1 rounded">${b.standard}</code></span>
            <span class="text-gray-500">📎 对应漏洞：${b.reference_vul}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");
}

function handleSearch() {
  const keyword = $("baseline-search-input").value.trim().toLowerCase();
  if (!keyword) { renderList(allBaselines); return; }
  const filtered = allBaselines.filter(b =>
    b.name.toLowerCase().includes(keyword) ||
    b.bid.toLowerCase().includes(keyword) ||
    b.category.toLowerCase().includes(keyword) ||
    b.standard.toLowerCase().includes(keyword)
  );
  renderList(filtered);
}

document.addEventListener("DOMContentLoaded", () => {
  loadBaselines();
  $("baseline-search-input").addEventListener("input", handleSearch);
});