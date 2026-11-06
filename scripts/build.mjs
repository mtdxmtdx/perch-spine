// 打成 Perch 要的单文件 ES 模块，和 plugin.json、许可证放在一起
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const out = "dist/perch-spine";
mkdirSync(out, { recursive: true });
await build({ entryPoints: ["src/index.ts"], bundle: true, format: "esm", target: "es2022", outfile: `${out}/index.js`, logLevel: "warning" });
copyFileSync("plugin.json", `${out}/plugin.json`);
copyFileSync("LICENSE", `${out}/LICENSE`);
copyFileSync("LICENSE-SPINE.txt", `${out}/LICENSE-SPINE.txt`);
console.log(`已生成 ${out}`);
