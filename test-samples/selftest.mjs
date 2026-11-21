/**
 * ============================================================
 *  selftest.mjs  ——  扫描器回归测试（成员B 产出）
 * ============================================================
 *  位置：test-samples/selftest.mjs
 *  用法：在项目根目录执行  →  node test-samples/selftest.mjs
 *
 *  作用：不打开浏览器，直接在命令行验证「规则库 + 扫描算法」是否正确。
 *        每次改完 vulnerabilities.json 或 scan.js，都必须跑一次。
 *  依赖：Node.js 18+（用了 node:fs / node:url 内置模块）
 * ============================================================
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { startScan, summarize } from "../js/core/scan.js";
import { validateResult } from "../js/core/data-schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // 项目根目录

/* ---------------- 1. 读规则库（与浏览器里读的是同一个文件） ---------------- */
const ruleList = JSON.parse(
  readFileSync(path.join(ROOT, "data", "vulnerabilities.json"), "utf-8")
);

/* ---------------- 2. 测试用例表 ---------------- */
// 每份样例的期望：total（总数）、vids（各规则命中数）、以及 stat 三个分项
const cases = [
  {
    file: "configs/sshd_bad.conf",
    memo: "3 项高危配置 + 注释行干扰",
    expect: { total: 3, vids: { VUL001: 1, VUL004: 1, VUL005: 1 }, high: 3, mid: 0, low: 0 }
  },
  {
    file: "configs/sshd_good.conf",
    memo: "配置全部达标，不应误报（真阴性）",
    expect: { total: 0, vids: {}, high: 0, mid: 0, low: 0 }
  },
  {
    file: "configs/sshd_comment.conf",
    memo: "漏洞特征全写在注释里，必须全部排除",
    expect: { total: 0, vids: {}, high: 0, mid: 0, low: 0 }
  },
  {
    file: "logs/vulnerable/demo_log.txt",
    memo: "1 条明文密码，2 条已脱敏",
    expect: { total: 1, vids: { VUL002: 1 }, high: 0, mid: 1, low: 0 }
  },
  {
    file: "logs/clean/ssh_login_normal.log",
    memo: "正常登录日志，不应有任何误报",
    expect: { total: 0, vids: {}, high: 0, mid: 0, low: 0 }
  },
  {
    file: "configs/web_config.ini",
    memo: "debug / ssl 关闭 / TraceEnable / 目录浏览",
    expect: { total: 4, vids: { VUL003: 1, VUL007: 1, VUL008: 1, VUL009: 1 }, high: 0, mid: 3, low: 1 }
  },
  {
    file: "code/app.py",
    memo: "2 处硬编码密钥 + eval + SQL 拼接 + md5",
    expect: { total: 5, vids: { VUL006: 2, VUL010: 1, VUL011: 1, VUL012: 1 }, high: 2, mid: 2, low: 1 }
  }
];

/* ---------------- 3. 执行并比对 ---------------- */
let passCount = 0;
const failures = [];

console.log("=".repeat(74));
console.log(`  扫描模块回归测试    规则库 ${ruleList.length} 条    样例 ${cases.length} 份`);
console.log("=".repeat(74));

for (const c of cases) {
  const filePath = path.join(__dirname, c.file);
  let result;
  try {
    const text = readFileSync(filePath, "utf-8");
    result = startScan(text, ruleList, { fileName: path.basename(c.file) });
  } catch (err) {
    console.log(`❌ FAIL  ${c.file.padEnd(30)}  读文件失败：${err.message}`);
    failures.push(`${c.file} 读取失败`);
    continue;
  }

  // 3.1 契约自检
  const schemaErrors = validateResult(result);
  // 3.2 数量比对
  const countErrors = [];
  if (result.stat.total !== c.expect.total) {
    countErrors.push(`总数 ${result.stat.total}，期望 ${c.expect.total}`);
  }
  for (const [vid, n] of Object.entries(c.expect.vids)) {
    const actual = result.vul_list.filter((v) => v.vid === vid).length;
    if (actual !== n) countErrors.push(`${vid} 命中 ${actual} 次，期望 ${n} 次`);
  }
  if (result.stat.high !== c.expect.high) countErrors.push(`高危 ${result.stat.high}，期望 ${c.expect.high}`);
  if (result.stat.mid !== c.expect.mid) countErrors.push(`中危 ${result.stat.mid}，期望 ${c.expect.mid}`);
  if (result.stat.low !== c.expect.low) countErrors.push(`低危 ${result.stat.low}，期望 ${c.expect.low}`);

  if (schemaErrors.length === 0 && countErrors.length === 0) {
    passCount++;
    console.log(`✅ PASS  ${c.file.padEnd(30)}  ${summarize(result)}`);
    for (const v of result.vul_list) {
      console.log(`           · 第 ${v.line} 行  [${v.level}] ${v.vid} ${v.vname}`);
    }
  } else {
    console.log(`❌ FAIL  ${c.file.padEnd(30)}  ${c.memo}`);
    [...schemaErrors, ...countErrors].forEach((e) => console.log(`           - ${e}`));
    failures.push(c.file);
  }
}

console.log("=".repeat(74));
console.log(`  结果：${passCount}/${cases.length} 通过`);
if (passCount === cases.length) {
  console.log("  全部通过 —— 扫描逻辑可用，可以拿去联调");
} else {
  console.log(`  有 ${failures.length} 个用例未通过，请检查规则库或样例：${failures.join(", ")}`);
}
console.log("=".repeat(74));

// 失败时用非 0 退出码，方便后续接入 CI
process.exit(passCount === cases.length ? 0 : 1);
