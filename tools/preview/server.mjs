// 预览页的本地服务：npm run preview -- <素材文件夹> [spine.json 里的 group]
// 素材文件夹里的文件名带前缀时，按结尾匹配（u000_templete.png 能找到 xxx-u000_templete.png）。
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const [dir = "ykn", group = "cool"] = process.argv.slice(2);
const port = Number(process.env.PORT || 5199);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png" };

function skinFile(name) {
  if (name === "spine.json") {
    return Buffer.from(JSON.stringify({ skeleton: "s000_templete.skel", atlas: "u000_templete.atlas.txt", group }));
  }
  const hit = readdirSync(dir).find((f) => f === name || f.endsWith(`-${name}`));
  return hit ? readFileSync(join(dir, hit)) : null;
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let body = null;
  if (path.startsWith("/skin/")) body = skinFile(path.slice(6));
  else {
    const rel = path === "/" ? "tools/preview/index.html" : path === "/main.js" ? "tools/preview/main.js" : normalize(path.slice(1));
    if (rel.startsWith("dist") || rel.startsWith("tools")) body = existsSync(rel) ? readFileSync(rel) : null;
  }
  if (!body) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": types[extname(path)] ?? (path === "/" ? types[".html"] : "application/octet-stream") }).end(body);
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
