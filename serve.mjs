#!/usr/bin/env node
/**
 * 零依赖本地静态服务器（给联调用）
 *
 * 用法：
 *   把这个文件放在项目根目录（和 index.html 同级），然后：
 *   node serve.mjs          → 起在 http://localhost:8000
 *   node serve.mjs 8080     → 指定端口
 *
 * 为什么需要它：
 *   浏览器直接双击打开 html（file:// 协议）时，ESM 的 import 会被 CORS 拦截，
 *   报 "Cross origin requests are only supported for protocol schemes: http, https"。
 *   必须走 http:// 才能加载 js/core/scan.js。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 8000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".conf": "text/plain; charset=utf-8",
  ".ini": "text/plain; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad Request");
  }

  // 防目录穿越
  const target = path.normalize(path.join(ROOT, urlPath));
  if (!target.startsWith(ROOT)) return send(res, 403, "Forbidden");

  fs.stat(target, (err, st) => {
    if (err) {
      console.log(`404 ${urlPath}`);
      return send(res, 404, `404 Not Found: ${urlPath}`);
    }

    if (st.isDirectory()) {
      const indexFile = path.join(target, "index.html");
      if (fs.existsSync(indexFile)) return serveFile(res, indexFile);
      // 列目录，方便直接点进去选页面
      const items = fs.readdirSync(target, { withFileTypes: true })
        .map(d => {
          const name = d.name + (d.isDirectory() ? "/" : "");
          const href = path.posix.join(urlPath, d.name);
          return `<li><a href="${href}">${name}</a></li>`;
        })
        .join("\n");
      const html = `<!doctype html><meta charset="utf-8"><title>目录 ${urlPath}</title>
<body style="font:14px/1.8 system-ui;padding:24px">
<h3>${urlPath}</h3><ul>${items || "<li>（空目录）</li>"}</ul></body>`;
      return send(res, 200, html, "text/html; charset=utf-8");
    }

    serveFile(res, target);
  });
});

function serveFile(res, file) {
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 500, `读取失败: ${err.message}`);
    console.log(`200 ${path.relative(ROOT, file)}`);
    send(res, 200, buf, type);
  });
}

server.listen(PORT, () => {
  console.log("=".repeat(60));
  console.log(`  本地服务已启动    目录：${ROOT}`);
  console.log(`  打开：http://localhost:${PORT}/`);
  console.log("=".repeat(60));
  console.log("  常用入口：");
  console.log(`    整站首页      http://localhost:${PORT}/index.html`);
  console.log(`    审计任务页    http://localhost:${PORT}/pages/audit-task.html`);
  console.log(`    联调预演页    http://localhost:${PORT}/test-samples/mock-a-page.html`);
  console.log("=".repeat(60));
  console.log("  停止：Ctrl + C");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n端口 ${PORT} 被占用了，换一个：node serve.mjs 8080\n`);
  } else {
    console.error("\n启动失败：", e.message);
  }
  process.exit(1);
});
