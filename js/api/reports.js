/**
 * js/api/reports.js —— 文件审计报告接口封装
 *
 * 对应后端：
 *   POST   /api/reports/save
 *   GET    /api/reports
 *   GET    /api/reports/{report_no}
 *   DELETE /api/reports/{report_no}
 */

import { request } from "./client.js";

/** 保存一次扫描结果；result 就是 scan.js 返回的 { vul_list, stat, scan_meta } */
export function saveFileReport(result) {
  return request("/api/reports/save", {
    method: "POST",
    body: result,
  });
}

export function listFileReports(page, pagesize) {
  page = page || 1;
  pagesize = pagesize || 10;
  return request(
    "/api/reports?report_type=file&page=" + page + "&pagesize=" + pagesize
  );
}

export function getReport(reportNo) {
  return request("/api/reports/" + encodeURIComponent(reportNo));
}

export function deleteReport(reportNo) {
  return request("/api/reports/" + encodeURIComponent(reportNo), {
    method: "DELETE",
  });
}
