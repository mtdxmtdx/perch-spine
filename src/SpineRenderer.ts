// Spine 渲染器：把皮肤文件夹里的骨骼画到 WebGL 画布上，按 Perch 的状态播放动作。

import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  GLTexture,
  ManagedWebGLRenderingContext,
  MixBlend,
  MixDirection,
  SceneRenderer,
  Skeleton,
  SkeletonBinary,
  type SkeletonData,
  type Skin,
  TextureAtlas,
  Vector2,
} from "@esotericsoftware/spine-webgl";
import { parseConfig, resolveAnims, type SpineConfig } from "./config.ts";
import { computeFrame, type Box, type Frame, unionBox } from "./layout.ts";
import type { LiveMask, PluginApi, SkinSource } from "./types.ts";

/** 桌宠常驻，30 帧足够，省 GPU */
const FRAME_MS = 1000 / 30;
const MIX_SECONDS = 0.15;

// 贴图按原样上传，要不要预乘由 drawSkeleton 的参数决定
GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true;

/** 模板是多套服装共用的，服装图集里没有的部件直接跳过 */
class LenientLoader extends AtlasAttachmentLoader {
  skipped: string[] = [];
  newRegionAttachment(skin: Skin, name: string, path: string) {
    if (this.atlas.findRegion(path)) return super.newRegionAttachment(skin, name, path);
    this.skipped.push(path);
    return null as never;
  }
  newMeshAttachment(skin: Skin, name: string, path: string) {
    if (this.atlas.findRegion(path)) return super.newMeshAttachment(skin, name, path);
    this.skipped.push(path);
    return null as never;
  }
}

interface Loaded {
  cfg: SpineConfig;
  atlas: TextureAtlas;
  skeleton: Skeleton;
  state: AnimationState;
  anims: Record<string, string>;
  frame: Frame;
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

    const loader = new LenientLoader(atlas);
    const data = new SkeletonBinary(loader).readSkeletonData(new Uint8Array(await src.readFile(cfg.skeleton)));
    if (loader.skipped.length) console.info(`[spine] 图集里没有 ${loader.skipped.length} 个部件，已跳过`, [...new Set(loader.skipped)]);

    const skeleton = new Skeleton(data);
    if (data.findSkin(cfg.skin)) skeleton.setSkinByName(cfg.skin);
    else console.warn(`[spine] 没有皮肤 ${cfg.skin}，用默认皮肤`);
    skeleton.setToSetupPose();

    const { map, missing, canSit } = resolveAnims(cfg, this.api.anims, data.animations.map((a) => a.name));
    if (missing.length) console.warn(`[spine] 这些状态没有对应动作，用待机代替：${missing.join("、")}`);

    const frame = measure(data, skeleton, map, cfg);
    const stateData = new AnimationStateData(data);
    stateData.defaultMix = MIX_SECONDS;

    this.dispose();
    const pma = cfg.pma ?? atlas.pages.some((p) => p.pma);
    this.loaded = { cfg, atlas, skeleton, state: new AnimationState(stateData), anims: map, frame, pma };
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
    l.skeleton.y = this.anim === "sit" ? l.cfg.sitOffsetY : 0;
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

    const { gl } = this.context;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const { world } = frame;
    const camera = this.scene.camera;
    camera.setViewport(world.maxX - world.minX, world.maxY - world.minY);
    camera.position.set((world.minX + world.maxX) / 2, (world.minY + world.maxY) / 2, 0);
    this.scene.begin();
    this.scene.drawSkeleton(skeleton, pma);
    this.scene.end();

    // 要在画完的同一个任务里读，否则 WebGL 的画面已经被清掉
    const mask = this.live.sample(this.canvas, this.forceMask);
    this.forceMask = false;
    if (mask) this.hitCb?.({ mask });
  }
}

function boundsOf(skeleton: Skeleton): Box {
  const offset = new Vector2();
  const size = new Vector2();
  skeleton.getBounds(offset, size, []);
  return { minX: offset.x, minY: offset.y, maxX: offset.x + size.x, maxY: offset.y + size.y };
}

/** 量出待机姿势和所有用到的动作的包围盒 */
function measure(data: SkeletonData, skeleton: Skeleton, map: Record<string, string>, cfg: SpineConfig): Frame {
  const sample = (name: string, t: number, y: number) => {
    skeleton.setToSetupPose();
    skeleton.y = y;
    data.findAnimation(name)!.apply(skeleton, 0, t, false, [], 1, MixBlend.setup, MixDirection.mixIn);
    skeleton.updateWorldTransform();
    return boundsOf(skeleton);
  };
  const idle = sample(map.idle, 0, 0);
  let all = idle;
  for (const [state, name] of Object.entries(map)) {
    const duration = data.findAnimation(name)!.duration;
    const y = state === "sit" ? cfg.sitOffsetY : 0;
    for (const f of [0, 0.25, 0.5, 0.75]) {
      const b = sample(name, duration * f, y);
      if (Number.isFinite(b.minX + b.maxX + b.minY + b.maxY)) all = unionBox(all, b);
    }
  }
  skeleton.setToSetupPose();
  skeleton.y = 0;
  return computeFrame(idle, all, cfg.height);
}
