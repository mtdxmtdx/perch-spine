// 不启动 Perch，在网页里模拟插件接口，看渲染效果。绿线是脚底，紫线是头顶。
import setup from "/dist/perch-spine/index.js";

const ANIMS = ["idle", "walk_right", "walk_left", "wave", "talk", "jump", "fall", "land", "drag", "sleep", "sit", "listen", "think", "working", "attention", "error", "done"];
const SCALE = 2;
const log = (...a) => (document.querySelector("#log").textContent += a.join(" ") + "\n");

/** 和 Perch 的 LiveMask 一样从画布读透明度，这里只统计不透明的比例 */
class LiveMask {
  constructor(ms = 80) {
    this.ms = ms;
    this.last = 0;
  }
  sample(canvas, force) {
    const now = performance.now();
    if (!force && now - this.last < this.ms) return null;
    this.last = now;
    const c = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let solid = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] >= 40) solid++;
    return { w: c.width, h: c.height, solid: solid / (c.width * c.height), bits: [] };
  }
  reset() {
    this.last = 0;
  }
}

let renderer;
await setup({ apiVersion: 1, anims: ANIMS, LiveMask, packMask() {}, registerRenderer: (_, create) => (renderer = create()) });

const src = {
  info: { id: "preview", name: "preview" },
  readFile: async (path) => {
    const r = await fetch(`/skin/${encodeURIComponent(path)}`);
    if (!r.ok) throw new Error(`读不到 ${path}`);
    return r.arrayBuffer();
  },
};

const stage = document.querySelector("#stage");
stage.style.width = stage.style.height = "400px";
renderer.mount(document.querySelector("#host"));
renderer.onHit((u) => (window.__mask = u.mask));
const { layout } = await renderer.load(src);
stage.style.width = `${layout.cellW * SCALE}px`;
stage.style.height = `${layout.cellH * SCALE}px`;
renderer.resize = ((f) => () => f.call(renderer))(renderer.resize);
// 预览页的画布按舞台大小，不是窗口大小
const canvas = document.querySelector("#host canvas");
const fit = () => {
  canvas.width = layout.cellW * SCALE;
  canvas.height = layout.cellH * SCALE;
  canvas.getContext("webgl2")?.viewport(0, 0, canvas.width, canvas.height);
};
fit();
document.querySelector("#foot").style.top = `${layout.footRatio * 100}%`;
document.querySelector("#top").style.top = `${layout.topRatio * 100}%`;
log(JSON.stringify(layout));
renderer.play("idle");

for (const a of ANIMS) {
  const b = document.createElement("button");
  b.textContent = a;
  b.onclick = () => renderer.play(a);
  document.querySelector("#states").append(b);
}
window.__renderer = renderer;
window.__layout = layout;
