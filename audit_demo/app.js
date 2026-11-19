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
  const tbody = $("result-table-body");
  tbody.innerHTML = "";

  if (result.vul_list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-6">未检出风险项</td></tr>';
    return;
  }

  result.vul_list.forEach((v, idx) => {
    const tr = document.createElement("tr");
    const badgeClass = LEVEL_CLASS[v.level] || "risk-low";
    
    // ⭐ 第⑥步：给操作列加了"详情"按钮！
    tr.innerHTML =
      `<td>${idx + 1}</td>` +
      `<td>${v.vname}</td>` +
      `<td><span class="badge ${badgeClass}">${v.level}</span></td>` +
      `<td>第 ${v.line} 行</td>` +
      `<td>${v.hit_content}</td>` +
      `<td><button class="btn-mini view-detail" data-idx="${idx}">详情</button></td>`;
    
    tbody.appendChild(tr);
  });

  // ⭐ 第⑥步：给每个"详情"按钮绑点击事件
  tbody.querySelectorAll(".view-detail").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const v = result.vul_list[idx];
      
      // 🎉 用队友的 Modal.alert 显示漏洞详情！
      // Modal.alert(显示内容, 配置项)
      Modal.alert(
        `
        <b>漏洞编号：</b>${v.vid}<br>
        <b>风险等级：</b>${v.level}<br>
        <b>位置：</b>${v.file_name} 第 ${v.line} 行<br>
        <b>命中内容：</b><code>${v.hit_content}</code><br><br>
        <b>漏洞原理：</b>${v.description}<br><br>
        <b>修复建议：</b>${v.suggestion}
        `,
        { title: `${v.vname}` }
      );
    });
  });
}

/* ============ handleFile（把完整流程连起来） ============ */
async function handleFile(file) {
  $("scan-status-tip").textContent = `正在扫描 ${file.name} …`;
  $("scan-progress-bar").style.width = "30%";

  try {
    const text = await readFileAsText(file);
    $("scan-progress-bar").style.width = "70%";

    const result = await scanText(text, file.name);

    renderTable(result);

    $("scan-progress-bar").style.width = "100%";
    $("scan-status-tip").textContent = `扫描完成：${summarize(result)}`;
    window.dispatchEvent(new CustomEvent("scan:complete", { detail: result }));

  } catch (err) {
    $("scan-progress-bar").style.width = "0%";
    $("scan-status-tip").textContent = `扫描失败：${err.message}`;
    alert("❌ 扫描出错！错误信息：\n" + err.message);
  }
}