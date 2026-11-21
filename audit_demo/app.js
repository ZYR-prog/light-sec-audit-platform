/**
 * audit_demo/app.js —— 仪表盘数据加载
 * 负责人：B（安全审计核心 / 数据契约）
 *
 * 职责：把 localStorage 里的扫描报告聚合后填进仪表盘
 *   - 三张风险卡片：累计高危 / 中危 / 低危
 *   - 风险分布环形图：累计分布（Chart.js 可用则用，否则原生 canvas 手绘）
 *   - 最近扫描记录：最近 5 条
 *
 * 数据源（与 C 的 js/ui/storage.js 对齐）：
 *   Storage 封装会加前缀 "sap_"，本地报告列表 key = "local_reports"
 *   → localStorage 实际键名 "sap_local_reports"，值为 "过期时间|||json" 打包串
 *   数组最新一条在前（unshift 写入），最多 20 条
 *
 * 本文件不依赖任何第三方库，普通 <script> 引入即可（不是 module）。
 */
(function () {
  "use strict";

  /* ---------------- 常量 ---------------- */

  var KEY_LOCAL_LIST = "local_reports";        // 经 Storage 封装的用法
  var RAW_KEY_LOCAL_LIST = "sap_local_reports";// 未引入 storage.js 时的真实键名
  var RAW_KEY_SCAN_RESULT = "scanResult";      // 早期单页版写入的裸 key
  var LEGACY_KEY = "lsap.lastScan";            // 旧方案兜底
  var PACK_SEPARATOR = "|||";                  // Storage.pack 的过期时间分隔符

  var MAX_RECENT = 5;

  // 配色与等级文案：与 data-schema.js 的 LEVEL_COLOR 保持一致
  var COLORS = { high: "#ef4444", mid: "#f59e0b", low: "#3b82f6" };
  var LABELS = { high: "高危", mid: "中危", low: "低危" };

  /* ---------------- 读取 ---------------- */

  /** 解析存储值：兼容 "过期时间|||json" 打包格式与裸 JSON */
  function unpackPacked(str) {
    if (str === null || str === undefined) return null;
    var s = String(str);
    var sepIndex = s.indexOf(PACK_SEPARATOR);
    if (sepIndex !== -1 && /^\d*$/.test(s.substring(0, sepIndex))) {
      try { return JSON.parse(s.substring(sepIndex + PACK_SEPARATOR.length)); } catch (e) { /* 落到下面 */ }
    }
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  /** 判断一个对象是不是扫描结果（报告） */
  function looksLikeReport(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    return Array.isArray(o.vul_list) ||
      o.scan_meta !== undefined ||
      o.stat !== undefined;
  }

  /** 取报告的排序时间戳 */
  function timeOf(r) {
    var t = (r && r.created_at) ||
      (r && r.scan_meta && r.scan_meta.scan_time) || "";
    var ts = new Date(t).getTime();
    return isNaN(ts) ? 0 : ts;
  }

  /** 去重标识 */
  function keyOf(r) {
    if (r.report_no) return String(r.report_no);
    var name = r.file_name || (r.scan_meta && r.scan_meta.file_name) || "";
    return name + "|" + timeOf(r);
  }

  /**
   * 扫描 localStorage 全部键，收集所有扫描报告，按时间倒序。
   * 不写死 key —— 项目里同时存在 sap_local_reports / scanResult / lsap.lastScan
   * 三套命名，全库遍历最稳。
   */
  function readReports() {
    var out = [];
    var seen = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var val = unpackPacked(localStorage.getItem(k));
        var items = null;
        if (Array.isArray(val)) {
          items = val;
        } else if (looksLikeReport(val)) {
          items = [val];
        }
        if (!items) continue;
        for (var j = 0; j < items.length; j++) {
          var r = items[j];
          if (!looksLikeReport(r)) continue;
          var id = keyOf(r);
          if (seen[id]) continue;
          seen[id] = true;
          out.push(r);
        }
      }
    } catch (err) { /* 读不到就走空状态 */ }
    out.sort(function (a, b) { return timeOf(b) - timeOf(a); });
    return out;
  }

  /* ---------------- 归一化 ---------------- */

  /** 取单条报告的风险计数；stat 缺失时从 vul_list 反推 */
  function statOf(report) {
    var s = report && report.stat;
    if (s && typeof s === "object") {
      var h = Number(s.high) || 0;
      var m = Number(s.mid) || 0;
      var l = Number(s.low) || 0;
      if (h + m + l > 0 || Number(s.total) === 0) {
        return { high: h, mid: m, low: l };
      }
    }
    // 兜底：数 vul_list 里的等级（等级字段只有中文三值）
    var out = { high: 0, mid: 0, low: 0 };
    var list = (report && report.vul_list) || [];
    for (var i = 0; i < list.length; i++) {
      var lv = list[i] && list[i].level;
      if (lv === "高危") out.high++;
      else if (lv === "中危") out.mid++;
      else if (lv === "低危") out.low++;
    }
    return out;
  }

  /** 取文件名：顶层 file_name 优先，其次 scan_meta.file_name */
  function nameOf(report) {
    if (!report) return "未命名文件";
    if (report.file_name) return String(report.file_name);
    if (report.scan_meta && report.scan_meta.file_name) {
      return String(report.scan_meta.file_name);
    }
    return "未命名文件";
  }

  /** ISO 时间 → "MM-DD HH:mm" */
  function formatTime(iso) {
    if (!iso) return "时间未知";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 16);
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
           pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /* ---------------- 渲染：卡片 ---------------- */

  function renderCards(sum) {
    var map = {
      "high-risk-count": sum.high,
      "mid-risk-count": sum.mid,
      "low-risk-count": sum.low
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = String(map[id]);
    });
  }

  /* ---------------- 渲染：环形图 ---------------- */

  var chartInstance = null;

  /** 用 Chart.js 画（index.html 取消注释 CDN 后走这条） */
  function drawWithChartJs(canvas, sum) {
    var total = sum.high + sum.mid + sum.low;
    chartInstance = new window.Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: [LABELS.high, LABELS.mid, LABELS.low],
        datasets: [{
          data: total === 0 ? [1] : [sum.high, sum.mid, sum.low],
          backgroundColor: total === 0
            ? ["#374151"]
            : [COLORS.high, COLORS.mid, COLORS.low],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        plugins: {
          legend: { position: "bottom", labels: { color: "#9ca3af", boxWidth: 12 } }
        }
      }
    });
  }

  /** 原生 canvas 手绘环形图（无 Chart.js 时兜底，零依赖） */
  function drawNativeDoughnut(canvas, sum) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 300;
    var h = canvas.clientHeight || 256;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var cx = w / 2;
    var cy = h / 2;
    var outer = Math.min(w, h) / 2 - 10;
    var inner = outer * 0.58;

    var parts = [
      { value: sum.high, color: COLORS.high },
      { value: sum.mid, color: COLORS.mid },
      { value: sum.low, color: COLORS.low }
    ];
    var total = sum.high + sum.mid + sum.low;

    if (total === 0) {
      // 空数据：完整灰色环
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.arc(cx, cy, inner, Math.PI * 2, 0, true);
      ctx.closePath();
      ctx.fillStyle = "#374151";
      ctx.fill();
    } else {
      var start = -Math.PI / 2; // 从 12 点方向开始
      parts.forEach(function (p) {
        if (p.value <= 0) return;
        var angle = (p.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outer, start, start + angle);
        ctx.arc(cx, cy, inner, start + angle, start, true);
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();
        start += angle;
      });
    }

    // 中心文字
    ctx.fillStyle = total === 0 ? "#6b7280" : "#e5e7eb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 " + Math.round(outer * 0.28) + "px system-ui, -apple-system, sans-serif";
    ctx.fillText(String(total), cx, cy - 8);
    ctx.fillStyle = "#9ca3af";
    ctx.font = Math.round(outer * 0.14) + "px system-ui, -apple-system, sans-serif";
    ctx.fillText(total === 0 ? "暂无数据" : "个漏洞", cx, cy + Math.round(outer * 0.22));
  }

  function renderChart(sum) {
    var canvas = document.getElementById("chart-risk-distribution");
    if (!canvas) return;

    // 重绘前销毁旧实例，避免 resize 时叠加
    if (chartInstance) {
      try { chartInstance.destroy(); } catch (e) { /* 忽略 */ }
      chartInstance = null;
    }

    if (window.Chart) {
      drawWithChartJs(canvas, sum);
    } else {
      drawNativeDoughnut(canvas, sum);
    }
  }

  /* ---------------- 渲染：最近记录 ---------------- */

  function makeBadge(count, color) {
    var span = document.createElement("span");
    span.className = "px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0";
    span.style.color = color;
    span.style.backgroundColor = hexToRgba(color, 0.15);
    span.textContent = String(count);   // textContent：文件名等不经过 innerHTML，防 XSS
    return span;
  }

  function hexToRgba(hex, alpha) {
    var c = hex.replace("#", "");
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    var r = parseInt(c.substring(0, 2), 16);
    var g = parseInt(c.substring(2, 4), 16);
    var b = parseInt(c.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function renderRecent(reports) {
    var box = document.getElementById("dashboard-recent-list");
    if (!box) return;

    box.textContent = "";   // 清空占位

    if (!reports.length) {
      var empty = document.createElement("p");
      empty.className = "text-gray-500 text-sm text-center py-8";
      empty.textContent = "暂无扫描记录";
      box.appendChild(empty);
      return;
    }

    reports.slice(0, MAX_RECENT).forEach(function (report) {
      var stat = statOf(report);

      var row = document.createElement("div");
      row.className =
        "flex items-center justify-between gap-3 px-3 py-2 rounded bg-gray-900/60 " +
        "hover:bg-gray-900 transition-colors";

      var left = document.createElement("div");
      left.className = "min-w-0 flex-1";

      var nameEl = document.createElement("p");
      nameEl.className = "text-sm text-gray-200 truncate";
      nameEl.textContent = nameOf(report);
      nameEl.title = nameOf(report);

      var metaEl = document.createElement("p");
      metaEl.className = "text-xs text-gray-500 mt-0.5";
      var total = stat.high + stat.mid + stat.low;
      var when = report.created_at ||
        (report.scan_meta && report.scan_meta.scan_time);
      metaEl.textContent = formatTime(when) +
        " · " + (report.local === false ? "云端" : "本地") +
        " · 共 " + total + " 项";

      left.appendChild(nameEl);
      left.appendChild(metaEl);

      var right = document.createElement("div");
      right.className = "flex items-center gap-1 flex-shrink-0";
      if (stat.high > 0) right.appendChild(makeBadge(stat.high, COLORS.high));
      if (stat.mid > 0) right.appendChild(makeBadge(stat.mid, COLORS.mid));
      if (stat.low > 0) right.appendChild(makeBadge(stat.low, COLORS.low));
      if (total === 0) {
        var safe = document.createElement("span");
        safe.className = "text-xs text-emerald-400 flex-shrink-0";
        safe.textContent = "无风险";
        right.appendChild(safe);
      }

      row.appendChild(left);
      row.appendChild(right);
      box.appendChild(row);
    });
  }

  /* ---------------- 主流程 ---------------- */

  function refresh() {
    var reports = readReports();

    var sum = { high: 0, mid: 0, low: 0 };
    reports.forEach(function (report) {
      var s = statOf(report);
      sum.high += s.high;
      sum.mid += s.mid;
      sum.low += s.low;
    });

    renderCards(sum);
    renderChart(sum);
    renderRecent(reports);
  }

  // 窗口尺寸变化时重绘图表（手绘 canvas 需要按新尺寸重算）
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var reports = readReports();
      var sum = { high: 0, mid: 0, low: 0 };
      reports.forEach(function (report) {
        var s = statOf(report);
        sum.high += s.high;
        sum.mid += s.mid;
        sum.low += s.low;
      });
      renderChart(sum);
    }, 200);
  });

  // 暴露给其他页面/控制台手动刷新
  window.refreshDashboard = refresh;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
