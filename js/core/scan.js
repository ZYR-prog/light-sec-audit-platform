/**
 * ============================================================
 *  scan.js  ——  安全审计核心扫描算法（成员B 产出）
 * ============================================================
 *  在团队规范里的位置：js/core/scan.js
 *
 *  职责边界（非常重要）：
 *    ✅ 负责：加载漏洞规则库 → 对传入的「文件全文文本」逐行正则匹配 → 输出标准化结果
 *    ✅ 负责：提供对外的 scanText() 接口，队友A 直接调用
 *    ❌ 不负责：读取本地文件（由 js/core/file-reader.js 负责，队友A 实现，把文本传给我）
 *    ❌ 不负责：渲染表格 / 进度条 / 弹窗（由 js/pages/audit-task.js 与 js/ui/ 负责）
 *    ❌ 不负责：存数据库 / 生成报告（由 backend 与 js/api/ 负责，队友C）
 *
 *  设计原则：本文件是纯逻辑模块，不碰 DOM，可脱离浏览器单独跑单元测试。
 * ============================================================
 */

import { LEVEL, LEVEL_LIST, createVulRecord, emptyStat } from "./data-schema.js";

/** 默认正则标志：i = 忽略大小写（配置里 Debug / debug / DEBUG 都能命中） */
const DEFAULT_FLAGS = "i";

/**
 * 规则库位置：data/vulnerabilities.json
 * 用 import.meta.url 定位，基准是「scan.js 自己所在的目录」，
 * 而不是「页面所在的目录」—— 这样无论页面在哪个子目录打开，都不会 404。
 * 路径换算：js/core/ → 上两级 → 项目根 → data/
 */
export const RULES_URL = new URL("../../data/vulnerabilities.json", import.meta.url).href;

/* ================================================================
 * 一、内部工具
 * ================================================================ */

/** 把各种换行符统一成 \n，避免 Windows 的 \r\n 导致行号错位 */
function normalizeText(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n");
}

/* ================================================================
 * 二、规则库加载
 * ================================================================ */

/**
 * 加载漏洞规则库
 * @param {string} [url] 规则库地址，默认 data/vulnerabilities.json
 * @returns {Promise<Array>} 漏洞规则数组
 */
export async function loadRuleLibrary(url = RULES_URL) {
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const rules = await resp.json();
    if (!Array.isArray(rules)) {
      throw new Error("规则库格式错误：JSON 根节点必须是数组 [ ... ]");
    }
    return rules;
  } catch (err) {
    console.error("[scan.js] 漏洞库加载失败：", err, "\n规则库地址：", url);
    throw err; // 交给调用方决定怎么提示用户
  }
}

/** 规则库缓存：整个页面生命周期只请求一次 */
let rulesCache = null;

/** 获取规则库（带缓存） */
export async function getRules() {
  if (!rulesCache) {
    rulesCache = await loadRuleLibrary();
  }
  return rulesCache;
}

/** 预加载规则库（页面启动时提前调用，避免第一次点扫描时卡顿） */
export function preloadRules() {
  return getRules();
}

/** 清空缓存（改了规则库文件后想立即生效时调用） */
export function clearRulesCache() {
  rulesCache = null;
}

/* ================================================================
 * 三、核心扫描算法
 * ================================================================ */

/**
 * 核心扫描函数（纯函数：同样的输入永远得到同样的输出）
 *
 * @param {string} fileText  待扫描的文件全文文本（队友A 用 file-reader.js 读出来后传入）
 * @param {Array}  ruleList  漏洞规则数组
 * @param {Object} [options] { fileName: "sshd_config" }
 * @returns {{vul_list: Array, stat: Object, scan_meta: Object}}
 */
export function startScan(fileText, ruleList, options = {}) {
  const t0 = Date.now();
  const text = normalizeText(fileText);
  const lines = text.split("\n");

  const vulList = [];
  const ruleErrors = []; // 记录写错的正则，方便调试

  for (const rule of ruleList) {
    let vulReg;
    let excludeReg = null;

    // ---- 编译正则：任何一条规则写错，只跳过它，不能让整个扫描崩掉 ----
    try {
      // 去掉 g / y 标志：global 会让 test() 的 lastIndex 乱跳，导致漏报
      const flags = String(rule.flags ?? DEFAULT_FLAGS).replace(/[gy]/g, "");
      vulReg = new RegExp(rule.pattern, flags);
      if (rule.exclude_pattern) {
        excludeReg = new RegExp(rule.exclude_pattern, flags);
      }
    } catch (err) {
      ruleErrors.push({ vid: rule.vid, error: err.message });
      console.warn(`[scan.js] 规则 ${rule.vid} 正则非法，已跳过：${err.message}`);
      continue;
    }

    // ---- 逐行匹配 ----
    for (let i = 0; i < lines.length; i++) {
      const lineStr = lines[i];
      if (!lineStr.trim()) continue; // 空行直接跳过

      // 第一道闸：命中排除规则（注释行、已脱敏内容等）→ 不算漏洞
      if (excludeReg && excludeReg.test(lineStr)) continue;

      // 第二道闸：命中漏洞特征 → 记一条漏洞
      if (vulReg.test(lineStr)) {
        vulList.push(
          createVulRecord(rule, i + 1, lineStr, options.fileName ?? "")
        );
      }
    }
  }

  // ---- 按等级统计，给 Dashboard 卡片 / 饼图用 ----
  const stat = emptyStat();
  for (const item of vulList) {
    if (item.level === LEVEL.HIGH) stat.high++;
    else if (item.level === LEVEL.MID) stat.mid++;
    else if (item.level === LEVEL.LOW) stat.low++;
  }
  stat.total = vulList.length;

  return {
    vul_list: vulList,
    stat,
    scan_meta: {
      file_name: options.fileName ?? "",
      total_lines: lines.length,
      rule_count: ruleList.length,
      rule_error_count: ruleErrors.length,
      cost_ms: Date.now() - t0,
      scan_time: new Date().toISOString()
    }
  };
}

/* ================================================================
 * 四、对外主接口（队友A 只调这一个）
 * ================================================================ */

/**
 * 扫描入口：给一段文本，返回扫描结果
 * @param {string} fileText 文件全文文本（A 用 file-reader.js 读出来的）
 * @param {string} [fileName] 文件名（写进结果、日志用）
 * @returns {Promise<{vul_list, stat, scan_meta}>}
 */
export async function scanText(fileText, fileName = "") {
  if (!fileText || !fileText.trim()) {
    throw new Error("待扫描内容为空：文件没有内容或读取失败");
  }
  const rules = await getRules();
  return startScan(fileText, rules, { fileName });
}

/**
 * 生成一句话结论，给队友A 填状态栏 / 队友C 写操作日志用
 * 例：检出 3 条风险（高危 1 / 中危 2 / 低危 0）
 */
export function summarize(result) {
  const { high, mid, low, total } = result.stat;
  if (total === 0) return "未检出风险项";
  return `检出 ${total} 条风险（高危 ${high} / 中危 ${mid} / 低危 ${low}）`;
}

/** summarize 的别名，保持与旧接口兼容 */
export const summaryOf = summarize;

/* ================================================================
 * 五、默认导出（方便 `import scan from "./scan.js"` 这种写法）
 * ================================================================ */
export default { startScan, scanText, loadRuleLibrary, getRules, preloadRules, summarize };

export { LEVEL, LEVEL_LIST };
