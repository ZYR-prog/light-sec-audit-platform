/**
 * audit_demo/report-app.js —— 审计报告页渲染
 * ==========================================
 * 数据来源：localStorage 的 `lsap.lastScan`（审计任务页扫描完成后写入的完整结果）
 * 依赖字段：result.scan_meta / result.stat / result.vul_list
 *           （契约见 js/core/data-schema.js）
 *
 * 设计要点：
 *   1. 全部使用 createElement + textContent 构建 DOM，
 *      不用 innerHTML 拼接被扫描内容 —— 避免文件里的特殊字符造成 XSS 或结构破坏。
 *   2. 字段缺失时逐项降级，不因为一个字段没有就整页空白。
 *   3. 打印友好：注入一段 @media print 规则，把深色卡片翻成白底黑字。
 *
 * 绑定 id（report.html 已有）：
 *   report-generate-btn / report-print-btn / report-main-container
 */
(function () {
  "use strict";

  /**
   * 数据源说明：
   *   不写死 key，遍历 localStorage 全部键找扫描结果，按时间取最新。
   *
   *   项目里先后出现过三套命名，全都要能兼容：
   *     sap_local_reports  —— C 的 js/ui/storage.js 加 sap_ 前缀后的真实键名
   *     scanResult         —— A 的单页扫描版写入的裸 key
   *     lsap.lastScan      —— 早期方案，实际无人写入
   */
  var PACK_SEPARATOR = "|||";                // Storage.pack 的过期时间分隔符

  var LEVEL_ORDER = { "高危": 0, "中危": 1, "低危": 2 };
  var COLOR = {
    high: "text-red-400",
    mid: "text-yellow-400",
    low: "text-blue-400",
    total: "text-cyan-400"
  };

  /* ---------------- 工具 ---------------- */

  function $(id) {
    return document.getElementById(id);
  }

  /** 建元素：标签、class、文本（文本一律走 textContent，防注入） */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function fmtTime(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function levelClass(level) {
    if (level === "高危") return "risk-high";
    if (level === "中危") return "risk-mid";
    return "risk-low";
  }

  /** 把一条报告对象整理成扫描结果结构；结构不合法返回 null */
  function normalize(data) {
    if (!data || typeof data !== "object") return null;
    if (!data.scan_meta && !data.stat && !Array.isArray(data.vul_list)) return null;
    if (!Array.isArray(data.vul_list)) data.vul_list = [];
    if (!data.stat) {
      data.stat = { high: 0, mid: 0, low: 0, total: data.vul_list.length };
    }
    if (!data.scan_meta) data.scan_meta = {};
    // 有的存储结构把文件名放在顶层，补齐到 scan_meta 供报告头使用
    if (!data.scan_meta.file_name && data.file_name) {
      data.scan_meta.file_name = data.file_name;
    }
    return data;
  }

  /** 解析 Storage.pack 格式：expireTime|||json */
  function unpackPacked(str) {
    if (!str) return null;
    if (str.indexOf(PACK_SEPARATOR) === -1) {
      try { return JSON.parse(str); } catch (e) { return null; }
    }
    var valueStr = str.substring(str.indexOf(PACK_SEPARATOR) + PACK_SEPARATOR.length);
    try { return JSON.parse(valueStr); } catch (e) { return null; }
  }

  /** 安全 JSON 解析 */
  function safeJson(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  /**
   * 解析任意存储值：既可能是 Storage.pack 的 "过期时间|||json"，
   * 也可能是裸 JSON 字符串。
   */
  function parseAny(str) {
    if (str === null || str === undefined) return null;
    var s = String(str);
    var sep = s.indexOf(PACK_SEPARATOR);
    if (sep !== -1) {
      var head = s.substring(0, sep);
      // 只有分隔符前是纯数字时才认为这是打包格式
      if (/^\d*$/.test(head)) {
        var packed = safeJson(s.substring(sep + PACK_SEPARATOR.length));
        if (packed !== null) return packed;
      }
    }
    return safeJson(s);
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

  /** 去重用的标识 */
  function keyOf(r) {
    if (r.report_no) return String(r.report_no);
    var name = r.file_name || (r.scan_meta && r.scan_meta.file_name) || "";
    return name + "|" + timeOf(r);
  }

  /**
   * 扫描 localStorage 全部键，把所有扫描结果收集起来，按时间倒序。
   *
   * 为什么不写死 key：项目里先后出现过三套命名
   *   sap_local_reports（C 的 Storage 封装，sap_ 前缀）
   *   scanResult（A 的单页扫描版，裸 key）
   *   lsap.lastScan（早期方案，实际无人写入）
   * 直接遍历全库，任何一套写得进就能读得到，且按时间取最新。
   */
  function collectAll() {
    var out = [];
    var seen = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var val = parseAny(localStorage.getItem(k));
        var items = null;
        if (Array.isArray(val)) {
          items = val;
        } else if (looksLikeReport(val)) {
          items = [val];
        }
        if (!items) continue;
        for (var j = 0; j < items.length; j++) {
          var r = normalize(items[j]);
          if (!r) continue;
          var id = keyOf(r);
          if (seen[id]) continue;
          seen[id] = true;
          out.push(r);
        }
      }
    } catch (err) { /* 读不到就算了，页面走空状态 */ }
    out.sort(function (a, b) { return timeOf(b) - timeOf(a); });
    return out;
  }

  /** 取最近一份扫描结果 */
  function readResult() {
    var list = collectAll();
    return list.length ? list[0] : null;
  }

  /* ---------------- 打印样式（只加一次） ---------------- */

  function ensurePrintStyle() {
    if (document.getElementById("report-print-style")) return;
    var style = document.createElement("style");
    style.id = "report-print-style";
    style.textContent = [
      "@media print {",
      "  #report-main-container, #report-main-container * {",
      "    background: #fff !important; color: #000 !important;",
      "    box-shadow: none !important;",
      "  }",
      "  #report-main-container .risk-badge { border: 1px solid #999 !important; }",
      "  #report-main-container tr, #report-main-container td, #report-main-container th {",
      "    border-color: #bbb !important;",
      "  }",
      "}"
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ---------------- 各区块 ---------------- */

  function buildHeader(meta) {
    var wrap = el("div", "mb-6 pb-5 border-b border-gray-700");
    wrap.appendChild(el("h1", "text-2xl font-bold mb-1", "安全审计报告"));
    wrap.appendChild(el(
      "p",
      "text-xs text-gray-500",
      "生成时间 " + fmtTime(new Date()) + " · 由「轻量级安全审计平台」自动生成"
    ));

    var grid = el("div", "grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 mt-4 text-sm");
    var rows = [
      ["审计文件", meta.file_name || "-"],
      ["扫描时间", fmtTime(meta.scan_time)],
      ["文件总行数", meta.total_lines != null ? meta.total_lines + " 行" : "-"],
      ["规则库版本", meta.rule_count != null ? meta.rule_count + " 条规则" : "-"],
      ["扫描耗时", meta.cost_ms != null ? meta.cost_ms + " ms" : "-"],
      ["规则异常", meta.rule_error_count ? meta.rule_error_count + " 条加载失败" : "无"]
    ];
    rows.forEach(function (pair) {
      var item = el("div", "flex gap-2");
      item.appendChild(el("span", "text-gray-500 flex-shrink-0", pair[0] + "："));
      item.appendChild(el("span", "text-gray-200 break-all", pair[1]));
      grid.appendChild(item);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function statCard(label, value, colorCls) {
    var card = el("div", "rounded-lg p-4 border border-gray-700");
    card.appendChild(el("p", "text-xs text-gray-500", label));
    card.appendChild(el("p", "text-2xl font-bold mt-1 " + colorCls, value));
    return card;
  }

  function buildStat(stat) {
    var wrap = el("div", "mb-6");
    wrap.appendChild(el("h2", "text-lg font-semibold mb-3", "风险总览"));
    var grid = el("div", "grid grid-cols-2 md:grid-cols-4 gap-3");
    grid.appendChild(statCard("高危", stat.high || 0, COLOR.high));
    grid.appendChild(statCard("中危", stat.mid || 0, COLOR.mid));
    grid.appendChild(statCard("低危", stat.low || 0, COLOR.low));
    grid.appendChild(statCard("合计", stat.total || 0, COLOR.total));
    wrap.appendChild(grid);
    return wrap;
  }

  function buildTable(list, stat) {
    var wrap = el("div", "mb-8");
    wrap.appendChild(el("h2", "text-lg font-semibold mb-3", "漏洞明细（" + list.length + " 条）"));

    if (!list.length) {
      // 明细为空时要区分两种情况：真没问题 / 统计数据有但明细缺失
      var claimed = stat ? (Number(stat.high) || 0) + (Number(stat.mid) || 0) + (Number(stat.low) || 0) : 0;
      if (claimed > 0) {
        var mismatch = el("div", "rounded-lg border border-yellow-700 bg-yellow-900/20 p-6 text-center text-yellow-300");
        mismatch.textContent = "统计数据记录 " + claimed +
          " 项风险，但明细未随结果保存。请在审计任务页重新扫描该文件以生成完整报告。";
        wrap.appendChild(mismatch);
      } else {
        var ok = el("div", "rounded-lg border border-green-700 bg-green-900/20 p-6 text-center text-green-300");
        ok.textContent = "本次扫描未发现问题，所有检查项通过。";
        wrap.appendChild(ok);
      }
      return wrap;
    }

    var tableWrap = el("div", "overflow-x-auto rounded-lg border border-gray-700");
    var table = el("table", "w-full text-sm");

    var thead = el("thead", "bg-gray-700/60 text-gray-300");
    var trh = el("tr");
    [["#", "w-10"], ["漏洞名称", "w-56"], ["等级", "w-16"], ["位置", "w-20"], ["描述与修复建议", ""]]
      .forEach(function (pair) {
        var th = el("th", "px-3 py-2 text-left " + pair[1], pair[0]);
        trh.appendChild(th);
      });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = el("tbody");
    var sorted = list.slice().sort(function (a, b) {
      var la = LEVEL_ORDER[a.level];
      var lb = LEVEL_ORDER[b.level];
      if (la !== lb) return (la === undefined ? 9 : la) - (lb === undefined ? 9 : lb);
      return (a.line || 0) - (b.line || 0);
    });

    sorted.forEach(function (item, index) {
      var tr = el("tr", "border-t border-gray-700 align-top");
      tr.appendChild(el("td", "px-3 py-2 text-gray-500", index + 1));
      tr.appendChild(el("td", "px-3 py-2 font-medium", item.vname || "-"));

      var tdLevel = el("td", "px-3 py-2");
      var badge = el("span", "risk-badge " + levelClass(item.level), item.level || "-");
      tdLevel.appendChild(badge);
      tr.appendChild(tdLevel);

      tr.appendChild(el("td", "px-3 py-2 text-gray-400",
        item.line != null ? "第 " + item.line + " 行" : "-"));

      var tdDesc = el("td", "px-3 py-2 text-gray-300");
      if (item.hit_content) {
        var hit = el("div", "text-xs text-gray-500 mb-1 break-all");
        hit.appendChild(el("span", "text-gray-600", "命中："));
        hit.appendChild(document.createTextNode(item.hit_content));
        tdDesc.appendChild(hit);
      }
      tdDesc.appendChild(el("p", "leading-relaxed", item.description || "-"));
      if (item.suggestion) {
        var sug = el("p", "text-xs text-cyan-300 mt-1 leading-relaxed");
        sug.appendChild(el("span", "text-gray-500", "修复建议："));
        sug.appendChild(document.createTextNode(item.suggestion));
        tdDesc.appendChild(sug);
      }
      tr.appendChild(tdDesc);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    var note = el("p", "text-xs text-gray-500 mt-3",
      "编号规则：VULxxx 对应 data/vulnerabilities.json 中的规则条目，可查阅 data/scan-rules.md 获取完整说明。");
    wrap.appendChild(note);
    return wrap;
  }

  function buildFooter(stat) {
    var wrap = el("div", "border-t border-gray-700 pt-4 text-xs text-gray-500 leading-relaxed");
    wrap.appendChild(el("p", null,
      "本报告由静态规则匹配自动生成，结论仅覆盖文本类配置与代码写法，不含二进制文件与运行时状态检测。"));
    wrap.appendChild(el("p", "mt-1",
      "共检查 " + (stat.total || 0) + " 项风险，其中高危 " + (stat.high || 0) +
      " 项，建议优先处理高危项。"));
    return wrap;
  }

  function buildEmpty() {
    var wrap = el("div", "text-center py-16");
    wrap.appendChild(el("p", "text-lg text-gray-300 mb-2", "尚未生成报告"));
    wrap.appendChild(el("p", "text-sm text-gray-500 mb-6",
      "需要先在「审计任务」页完成一次文件扫描，报告会基于最近一次扫描结果生成。"));
    var link = el("a", "inline-block bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 rounded font-semibold");
    link.href = "scan.html";
    link.textContent = "去审计任务页扫描";
    wrap.appendChild(link);
    return wrap;
  }

  /* ---------------- 主流程 ---------------- */

  function generateReport() {
    var container = $("report-main-container");
    if (!container) return;

    var result = readResult();
    if (!result) {
      container.innerHTML = "";
      container.appendChild(buildEmpty());
      return;
    }

    container.innerHTML = "";
    container.appendChild(buildHeader(result.scan_meta));
    container.appendChild(buildStat(result.stat));
    container.appendChild(buildTable(result.vul_list, result.stat));
    container.appendChild(buildFooter(result.stat));
  }

  function init() {
    ensurePrintStyle();

    var genBtn = $("report-generate-btn");
    if (genBtn) {
      genBtn.addEventListener("click", function () {
        generateReport();
        genBtn.textContent = "📄 已重新生成";
        setTimeout(function () { genBtn.textContent = "📄 生成报告"; }, 1200);
      });
    }

    var printBtn = $("report-print-btn");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        // 打印前先确保有内容
        var container = $("report-main-container");
        if (container && !container.querySelector("h1")) generateReport();
        window.print();
      });
    }

    // 进页面先尝试自动渲染（扫完直接过来就能看到报告）
    generateReport();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
