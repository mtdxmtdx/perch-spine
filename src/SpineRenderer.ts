// Spine 渲染器：把皮肤文件夹里的骨骼画到 WebGL 画布上，按 Perch 的状态播放动作。

import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  GLTexture,
  MeshAttachment,
  ManagedWebGLRenderingContext,
  MixBlend,
  MixDirection,
  RegionAttachment,
  SceneRenderer,
  Skeleton,
  SkeletonBinary,
  type SkeletonData,
  TextureAtlas,
  type TextureAtlasRegion,
} from "@esotericsoftware/spine-webgl";
import { parseConfig, resolveAnims, type SpineConfig } from "./config.ts";
import { computeFrame, type Box, type Frame, unionBox } from "./layout.ts";
import type { LiveMask, PluginApi, SkinSource } from "./types.ts";

/** 桌宠常驻，30 帧足够，省 GPU */
const FRAME_MS = 1000 / 30;
const MIX_SECONDS = 0.15;
/** 没写 sitOffsetY 时，座位离脚底的高度占身高的比例 */
const SEAT_RATIO = 0.14;
/** 量范围时用的画面边长 */
const MEASURE_SIZE = 256;
/** 和 Perch 的鼠标穿透一样，不透明度达到这个值才算实心 */
const MASK_ALPHA = 40;

// 贴图按原样上传，要不要预乘由 drawSkeleton 的参数决定
GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true;

interface Loaded {
  cfg: SpineConfig;
  atlas: TextureAtlas;
  skeleton: Skeleton;
  state: AnimationState;
  anims: Record<string, string>;
  frame: Frame;
  sitY: number;
  pma: boolean;
}

export class SpineRenderer {
  private live: LiveMask;
  private canvas!: HTMLCanvasElement;
  private context!: ManagedWebGLRenderingContext;
  private scene!: SceneRenderer;
  private loaded: Loaded | null = null;
  private hitCb?: (u: unknown) => void;
  private raf = 0;
  private lastDraw = 0;
  private anim = "idle";
  private facing = 1;
  private forceMask = false;

  constructor(private api: PluginApi) {
    this.live = new api.LiveMask(80);
  }

  mount(host: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width:100%;height:100%;display:block";
    host.appendChild(this.canvas);
    this.context = new ManagedWebGLRenderingContext(this.canvas, { alpha: true, premultipliedAlpha: true, antialias: true });
    this.scene = new SceneRenderer(this.canvas, this.context, false);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  async load(src: SkinSource) {
    const decode = (b: ArrayBuffer) => new TextDecoder().decode(b);
    const cfg = parseConfig(JSON.parse(decode(await src.readFile("spine.json"))));

    const atlas = new TextureAtlas(decode(await src.readFile(cfg.atlas)));
    for (const page of atlas.pages) {
      const blob = new Blob([await src.readFile(page.name)], { type: "image/png" });
      const image = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      page.setTexture(new GLTexture(this.context, image));
    }

    const data = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(await src.readFile(cfg.skeleton)));
    hideParts(data, cfg.hide);

    const skeleton = new Skeleton(data);
    if (data.findSkin(cfg.skin)) skeleton.setSkinByName(cfg.skin);
    else console.warn(`[spine] 没有皮肤 ${cfg.skin}，用默认皮肤`);
    skeleton.setToSetupPose();

    const { map, missing, canSit } = resolveAnims(cfg, this.api.anims, data.animations.map((a) => a.name));
    if (missing.length) console.warn(`[spine] 这些状态没有对应动作，用待机代替：${missing.join("、")}`);

    const pma = cfg.pma ?? atlas.pages.some((p) => p.pma);
    const { frame, sitY } = this.measure(data, skeleton, map, cfg, pma);
    const stateData = new AnimationStateData(data);
    stateData.defaultMix = MIX_SECONDS;

    this.dispose();
    this.loaded = { cfg, atlas, skeleton, state: new AnimationState(stateData), anims: map, frame, sitY, pma };
    this.live.reset();
    this.setAnim(true);

    const { cellW, cellH, footRatio, centerRatio, topRatio } = frame;
    return { layout: { cellW, cellH, footRatio, centerRatio, topRatio, canSit } };
  }

  play(anim: string) {
    if (anim === this.anim) return;
    this.anim = anim;
    this.setAnim(false);
  }

  onHit(cb: (u: unknown) => void) {
    this.hitCb = cb;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    this.context.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.live.reset();
    this.forceMask = true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.dispose();
    this.scene?.dispose();
    this.context?.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas?.remove();
  }

  private dispose() {
    this.loaded?.atlas.dispose();
    this.loaded = null;
  }

  private setAnim(first: boolean) {
    const l = this.loaded;
    if (!l) return;
    if (this.anim === "walk_right") this.facing = 1;
    if (this.anim === "walk_left") this.facing = -1;
    const name = l.anims[this.anim] ?? l.anims.idle;
    if (first || l.state.getCurrent(0)?.animation?.name !== name) l.state.setAnimation(0, name, true);
    l.skeleton.y = this.anim === "sit" ? l.sitY : 0;
    l.skeleton.scaleX = this.facing * (l.cfg.flip ? -1 : 1);
    this.forceMask = true;
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = now - this.lastDraw;
    if (dt < FRAME_MS || !this.loaded) return;
    this.lastDraw = now;
    this.draw(Math.min(dt / 1000, 0.1));
  };

  private draw(dt: number) {
    const { skeleton, state, frame, pma } = this.loaded!;
    state.update(dt);
    state.apply(skeleton);
    skeleton.updateWorldTransform();

    this.render(skeleton, frame.world, pma);

    // 要在画完的同一个任务里读，否则 WebGL 的画面已经被清掉
    const mask = this.live.sample(this.canvas, this.forceMask);
    this.forceMask = false;
    if (mask) this.hitCb?.({ mask });
  }

  private render(skeleton: Skeleton, world: Box, pma: boolean) {
    const { gl } = this.context;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const camera = this.scene.camera;
    camera.setViewport(world.maxX - world.minX, world.maxY - world.minY);
    camera.position.set((world.minX + world.maxX) / 2, (world.minY + world.maxY) / 2, 0);
    this.scene.begin();
    this.scene.drawSkeleton(skeleton, pma);
    this.scene.end();
  }

  /**
   * 量出待机姿势和所有用到的动作实际占的范围。部件图带透明边，只看顶点会偏大，
   * 所以先用顶点圈个大概，再把每个姿势画一遍、读不透明的像素。
   */
  private measure(data: SkeletonData, skeleton: Skeleton, map: Record<string, string>, cfg: SpineConfig, pma: boolean) {
    const pose = (name: string, t: number, y: number) => {
      skeleton.setToSetupPose();
      skeleton.y = y;
      data.findAnimation(name)!.apply(skeleton, 0, t, false, [], 1, MixBlend.setup, MixDirection.mixIn);
      skeleton.updateWorldTransform();
    };
    const poses: [string, number, boolean][] = [];
    for (const [state, name] of Object.entries(map)) {
      const duration = data.findAnimation(name)!.duration;
      for (const f of [0, 0.25, 0.5, 0.75]) poses.push([name, duration * f, state === "sit"]);
    }

    let range: Box = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    for (const [name, t] of poses) {
      pose(name, t, 0);
      const b = boundsOf(skeleton);
      if (Number.isFinite(b.minX + b.maxX + b.minY + b.maxY)) range = unionBox(range, b);
    }

    const { gl } = this.context;
    this.canvas.width = this.canvas.height = MEASURE_SIZE;
    gl.viewport(0, 0, MEASURE_SIZE, MEASURE_SIZE);
    const pixels = new Uint8Array(MEASURE_SIZE * MEASURE_SIZE * 4);
    const painted = (name: string, t: number, y: number) => {
      pose(name, t, y);
      this.render(skeleton, range, pma);
      gl.readPixels(0, 0, MEASURE_SIZE, MEASURE_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return opaqueBox(pixels, MEASURE_SIZE, range);
    };
    const idle = painted(map.idle, 0, 0);
    if (!idle) throw new Error("待机姿势什么都没画出来");
    const sitY = cfg.sitOffsetY ?? -SEAT_RATIO * (idle.maxY - idle.minY);
    range = { ...range, minY: range.minY + Math.min(sitY, 0), maxY: range.maxY + Math.max(sitY, 0) };
    let all = idle;
    for (const [name, t, sit] of poses) {
      const b = painted(name, t, sit ? sitY : 0);
      if (b) all = unionBox(all, b);
    }
    skeleton.setToSetupPose();
    skeleton.y = 0;
    this.resize();
    return { frame: computeFrame(idle, all, cfg.height), sitY };
  }
}

/** 画面里不透明部分的范围，换算回骨骼坐标；第 0 行是画面底部 */
function opaqueBox(pixels: Uint8Array, size: number, range: Box): Box | null {
  let x0 = size, x1 = -1, y0 = size, y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pixels[(y * size + x) * 4 + 3] < MASK_ALPHA) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const sx = (range.maxX - range.minX) / size;
  const sy = (range.maxY - range.minY) / size;
  return { minX: range.minX + x0 * sx, maxX: range.minX + (x1 + 1) * sx, minY: range.minY + y0 * sy, maxY: range.minY + (y1 + 1) * sy };
}

/** 把不想画的部件（默认是脚下的阴影）调成全透明。不能删：动画数据还引用着它们 */
function hideParts(data: SkeletonData, hide: string[]) {
  for (const skin of data.skins) {
    for (const { attachment } of skin.getAttachments()) {
      const region = regionOf(attachment);
      if (region && hide.includes(region.name)) (attachment as RegionAttachment | MeshAttachment).color.a = 0;
    }
  }
}

function regionOf(attachment: unknown): TextureAtlasRegion | null {
  if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) return attachment.region as TextureAtlasRegion;
  return null;
}

/** 当前姿势看得见的部分的包围盒。服装没用到的部件是 1×1 的占位图，不算（skeleton.getBounds 会把它们算进去） */
function boundsOf(skeleton: Skeleton): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const verts: number[] = [];
  for (const slot of skeleton.drawOrder) {
    const a = slot.getAttachment();
    const region = regionOf(a);
    if (!region || (region.width <= 1 && region.height <= 1) || slot.color.a === 0) continue;
    let n = 8;
    if (a instanceof RegionAttachment) {
      if (a.color.a === 0) continue;
      a.computeWorldVertices(slot.bone, verts, 0, 2);
    } else {
      const mesh = a as MeshAttachment;
      if (mesh.color.a === 0) continue;
      n = mesh.worldVerticesLength;
      mesh.computeWorldVertices(slot, 0, n, verts, 0, 2);
    }
    for (let i = 0; i < n; i += 2) {
      box.minX = Math.min(box.minX, verts[i]);
      box.maxX = Math.max(box.maxX, verts[i]);
      box.minY = Math.min(box.minY, verts[i + 1]);
      box.maxY = Math.max(box.maxY, verts[i + 1]);
    }
  }
  return box;
}
