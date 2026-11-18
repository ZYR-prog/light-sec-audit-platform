/**
 * ============================================================
 *  data-schema.js  ——  扫描结果数据结构定义（成员B 产出）
 * ============================================================
 *  作用：全队统一的「数据契约」。
 *        扫描出来的每一条结果长什么样、字段叫什么、等级怎么取值，
 *        全组都从这里取，谁都不许自己另起一套字段名。
 *
 *  依赖关系：只导出常量与纯函数，不 import 任何其他模块（避免循环依赖）。
 *  scan.js 会从这里取 LEVEL / createVulRecord 使用，保证两边永远一致。
 * ============================================================
 */

/* ------------------------------------------------------------------
 * 一、风险等级枚举
 * ------------------------------------------------------------------ */
export const LEVEL = Object.freeze({
  HIGH: "高危",
  MID: "中危",
  LOW: "低危"
});

/** 固定顺序：高危 → 中危 → 低危（页面渲染、图表都按这个顺序） */
export const LEVEL_LIST = [LEVEL.HIGH, LEVEL.MID, LEVEL.LOW];

/** 等级 → 页面徽章 CSS 类名（给队友A 的表格直接用） */
export const LEVEL_CLASS = Object.freeze({
  [LEVEL.HIGH]: "risk-high",
  [LEVEL.MID]: "risk-mid",
  [LEVEL.LOW]: "risk-low"
});

/** 等级 → 十六进制颜色（给队友A 的 Chart.js 饼图直接用） */
export const LEVEL_COLOR = Object.freeze({
  [LEVEL.HIGH]: "#ef4444",
  [LEVEL.MID]: "#f59e0b",
  [LEVEL.LOW]: "#3b82f6"
});

/* ------------------------------------------------------------------
 * 二、漏洞条目字段（vul_list 里每个对象的结构）
 * ------------------------------------------------------------------ */
/**
 * @typedef {Object} VulItem
 * @property {string} vid         规则编号，如 "VUL001"
 * @property {string} vname       漏洞名称，如 "SSH 开启密码登录认证"
 * @property {string} level       风险等级，取值见 LEVEL
 * @property {number} line        命中行号，从 1 开始
 * @property {string} hit_content 命中的那一行原文（已 trim，最长 200 字）
 * @property {string} description 漏洞原理说明
 * @property {string} suggestion  修复建议
 * @property {string} file_name   所属文件名
 */

/** 字段清单（顺序 = 页面表格/详情弹窗的展示顺序） */
export const VUL_FIELDS = Object.freeze([
  "vid",
  "vname",
  "level",
  "line",
  "hit_content",
  "description",
  "suggestion",
  "file_name"
]);

/** 拼一条漏洞记录：所有字段从这一个地方产生，杜绝字段名写错 */
export function createVulRecord(rule, line, hitContent, fileName = "") {
  return {
    vid: rule.vid,
    vname: rule.vname,
    level: rule.level,
    line,
    hit_content: String(hitContent ?? "").trim().slice(0, 200),
    description: rule.description,
    suggestion: rule.suggestion,
    file_name: fileName
  };
}

/* ------------------------------------------------------------------
 * 三、扫描结果整体结构（scan.js 的返回值）
 * ------------------------------------------------------------------ */
/**
 * @typedef {Object} ScanResult
 * @property {VulItem[]} vul_list  漏洞明细数组
 * @property {Object}    stat       分项统计 { high, mid, low, total }
 * @property {Object}    scan_meta  扫描元信息
 */

/**
 * scan_meta 字段说明：
 *   file_name          被扫描文件名
 *   total_lines        文件总行数
 *   rule_count         本次参与匹配的规则条数
 *   rule_error_count   正则写错被跳过的规则条数（>0 说明规则库有问题）
 *   cost_ms            扫描耗时（毫秒）
 *   scan_time          扫描时间（ISO 8601 字符串，给C 落库用）
 */
export const SCAN_META_FIELDS = Object.freeze([
  "file_name",
  "total_lines",
  "rule_count",
  "rule_error_count",
  "cost_ms",
  "scan_time"
]);

/** 生成一个空的统计对象 */
export function emptyStat() {
  return { high: 0, mid: 0, low: 0, total: 0 };
}

/* ------------------------------------------------------------------
 * 四、开发期自检工具（联调排错用，不影响正式流程）
 * ------------------------------------------------------------------ */
/**
 * 校验扫描结果是否符合契约。
 * @param {ScanResult} result
 * @returns {string[]} 错误描述数组，空数组 = 完全合规
 */
export function validateResult(result) {
  const errors = [];
  if (!result || typeof result !== "object") return ["结果不是对象"];

  if (!Array.isArray(result.vul_list)) errors.push("vul_list 必须是数组");

  const stat = result.stat;
  if (!stat || typeof stat !== "object") {
    errors.push("缺少 stat 对象");
  } else {
    for (const k of ["high", "mid", "low", "total"]) {
      if (typeof stat[k] !== "number") errors.push(`stat.${k} 必须是数字`);
    }
    if (stat.high + stat.mid + stat.low !== stat.total) {
      errors.push("stat 分项之和不等于 total");
    }
  }

  const meta = result.scan_meta;
  if (!meta || typeof meta !== "object") {
    errors.push("缺少 scan_meta 对象");
  } else {
    for (const k of SCAN_META_FIELDS) {
      if (!(k in meta)) errors.push(`scan_meta 缺少字段 ${k}`);
    }
  }

  (result.vul_list || []).forEach((v, i) => {
    for (const f of VUL_FIELDS) {
      if (!(f in v)) errors.push(`vul_list[${i}] 缺少字段 ${f}`);
    }
    if (!LEVEL_LIST.includes(v.level)) {
      errors.push(`vul_list[${i}] 等级非法：${v.level}`);
    }
    if (typeof v.line !== "number" || v.line < 1) {
      errors.push(`vul_list[${i}] 行号非法：${v.line}`);
    }
  });

  return errors;
}
