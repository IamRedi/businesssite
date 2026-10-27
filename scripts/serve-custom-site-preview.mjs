// Local private preview only. Exports/source inputs are never served.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, sep, extname } from "node:path";
const root = resolve(process.argv[2] ?? ".custom-site-private/preview");
const port = Number(process.argv[3] ?? 4178);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" };
createServer((request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (path !== "/" && !["/client.js", "/client.css"].includes(path) && !path.startsWith("/media/")) return response.writeHead(404).end();
    const file = resolve(root, path === "/" ? "index.html" : path.slice(1));
    if (!file.startsWith(root + sep)) return response.writeHead(404).end();
    const size = statSync(file).size, headers = { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store", "Accept-Ranges": "bytes" };
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
      if (start >= size || end < start) return response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      response.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 }); createReadStream(file, { start, end }).pipe(response);
    } else { response.writeHead(200, { ...headers, "Content-Length": size }); createReadStream(file).pipe(response); }
  } catch { response.writeHead(404).end(); }
}).listen(port, "127.0.0.1", () => console.log(`Private custom preview http://127.0.0.1:${port}`));
