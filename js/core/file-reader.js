/**
 * js/core/file-reader.js —— 本地文件读取封装
 *
 * scan.js 只接收文本，不碰 File/FileReader；读取由这里负责。
 * 单个文件限制 2MB，避免大文件把浏览器卡死。
 */

const MAX_BYTES = 2 * 1024 * 1024;

export function readFileAsText(file) {
  return new Promise(function (resolve, reject) {
    if (!file) {
      reject(new Error("没有选择文件"));
      return;
    }
    if (file.size > MAX_BYTES) {
      reject(new Error("文件超过 2MB，已跳过：" + file.name));
      return;
    }

    const reader = new FileReader();
    reader.onload = function () {
      resolve(String(reader.result || ""));
    };
    reader.onerror = function () {
      reject(new Error("读取失败：" + file.name));
    };
    reader.readAsText(file, "utf-8");
  });
}
