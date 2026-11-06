import { build } from "esbuild";
import { spawnSync } from "node:child_process";

await build({ entryPoints: ["tools/list-anims.ts"], bundle: true, format: "esm", platform: "node", outfile: "dist/list-anims.mjs", logLevel: "warning" });
const r = spawnSync(process.execPath, ["dist/list-anims.mjs", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
