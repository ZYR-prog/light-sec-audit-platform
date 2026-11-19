import { scanText, summarize } from "../js/core/scan.js";
import { LEVEL_CLASS } from "../js/core/data-schema.js";
const $ = (id) => document.getElementById(id);

/* ============ 步骤②：按钮活了 ============ */
$("scan-start-btn").addEventListener("click", () => {
  $("upload-file-input").click();
});

/* ============ 步骤③：拆快递 ============ */
function readFileAsText(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file, "utf-8");
  });
}

/* ============ 步骤③+④：选完文件后的完整流程 ============ */
$("upload-file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  handleFile(file);
});

/* ============ 步骤⑤：把结果渲染进表格 ============ */
function renderTable(result) {
  // tbody = scan.html 里 id="result-table-body" 的那个元素
  const tbody = $("result-table-body");
  tbody.innerHTML = "";  // 先清空之前的内容

  // 如果一条漏洞都没扫到
  if (result.vul_list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-6">未检出风险项</td></tr>';
    return;
  }

  // 遍历每一条漏洞，变成一行表格
  result.vul_list.forEach((v, idx) => {
    const tr = document.createElement("tr");
    // v.level 是 "高危"/"中危"/"低危"
    // LEVEL_CLASS[v.level] 是对应的CSS类名 "risk-high"/"risk-mid"/"risk-low"
    const badgeClass = LEVEL_CLASS[v.level] || "risk-low";
    
    tr.innerHTML =
      `<td>${idx + 1}</td>` +                    // 序号
      `<td>${v.vname}</td>` +                    // 漏洞名称
      `<td><span class="badge ${badgeClass}">${v.level}</span></td>` +  // 等级（带颜色徽章）
      `<td>第 ${v.line} 行</td>` +                // 位置
      `<td>${v.hit_content}</td>` +              // 描述（队友B建议用hit_content别用太长的description）
      `<td>—</td>`;                               // 操作列（先空着）
    
    tbody.appendChild(tr);  // 把这一行塞进 tbody
  });
}

/* ============ handleFile（把完整流程连起来） ============ */
async function handleFile(file) {
  $("scan-status-tip").textContent = `正在扫描 ${file.name} …`;
  $("scan-progress-bar").style.width = "30%";

  try {
    // ③ 拆快递
    const text = await readFileAsText(file);
    $("scan-progress-bar").style.width = "70%";

    // ④ 喊厨房
    const result = await scanText(text, file.name);

    // ⑤ 端上桌（渲染表格）
    renderTable(result);

    $("scan-progress-bar").style.width = "100%";
    $("scan-status-tip").textContent = `扫描完成：${summarize(result)}`;

    // 广播事件（队友C靠这个存历史记录，仪表盘也可以监听）
    window.dispatchEvent(new CustomEvent("scan:complete", { detail: result }));

  } catch (err) {
    $("scan-progress-bar").style.width = "0%";
    $("scan-status-tip").textContent = `扫描失败：${err.message}`;
    alert("❌ 扫描出错！错误信息：\n" + err.message);
  }
}