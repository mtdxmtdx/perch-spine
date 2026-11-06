// 皮肤文件夹里 spine.json 的解析，以及 Perch 状态名到动作名的对应。纯逻辑，不碰 WebGL。

export interface SpineConfig {
  /** 骨骼文件，相对皮肤文件夹 */
  skeleton: string;
  /** 图集描述文件，相对皮肤文件夹；贴图按图集里写的页名读 */
  atlas: string;
  /** Spine 皮肤名 */
  skin: string;
  /** 性格分组，默认动作名里的 {g} */
  group: string;
  /** 模型原本朝左时打开 */
  flip: boolean;
  /** 播 sit 时骨骼的纵向偏移（骨骼坐标），让坐姿贴住窗口顶边 */
  sitOffsetY: number;
  /** 画面基准高度（逻辑像素） */
  height: number;
  /** 贴图是否预乘透明度；不写就看图集的 pma */
  pma?: boolean;
  /** 逐个状态覆盖动作名 */
  anims: Record<string, string>;
}

/** 每个状态依次尝试的动作名，{g} 换成性格分组 */
export const DEFAULT_ANIMS: Record<string, string[]> = {
  idle: ["{g}_idle_0"],
  walk_right: ["mob_walk_0"],
  walk_left: ["mob_walk_0"],
  wave: ["{g}_talk_1"],
  talk: ["{g}_talk_1"],
  jump: ["{g}_surprised_0"],
  fall: ["{g}_surprised_0"],
  land: ["{g}_idle_0"],
  drag: ["{g}_surprised_0"],
  sleep: ["{g}_sleepy_0"],
  sit: ["{g}_sit_sit_1", "{g}_sit_sit_2"],
  listen: ["{g}_idle_0"],
  think: ["{g}_shy_0"],
  working: ["{g}_dance"],
  attention: ["{g}_surprised_0"],
  error: ["{g}_sad_0"],
  done: ["{g}_idle_0"],
};

export function parseConfig(raw: unknown): SpineConfig {
  if (typeof raw !== "object" || raw === null) throw new Error("spine.json 必须是一个对象");
  const o = raw as Record<string, unknown>;
  const text = (key: string) => {
    const v = o[key];
    if (typeof v !== "string" || !v.trim()) throw new Error(`spine.json 缺少 ${key}`);
    return v.trim();
  };
  const anims: Record<string, string> = {};
  if (typeof o.anims === "object" && o.anims !== null) {
    for (const [k, v] of Object.entries(o.anims)) if (typeof v === "string" && v.trim()) anims[k] = v.trim();
  }
  return {
    skeleton: text("skeleton"),
    atlas: text("atlas"),
    skin: typeof o.skin === "string" && o.skin.trim() ? o.skin.trim() : "default",
    group: typeof o.group === "string" && o.group.trim() ? o.group.trim() : "cute",
    flip: o.flip === true,
    sitOffsetY: typeof o.sitOffsetY === "number" ? o.sitOffsetY : 0,
    height: typeof o.height === "number" && o.height > 0 ? o.height : 208,
    pma: typeof o.pma === "boolean" ? o.pma : undefined,
    anims,
  };
}

export interface AnimMap {
  /** 状态名 → 动作名；没有对应动作的状态退回 idle */
  map: Record<string, string>;
  /** 退回 idle 的状态 */
  missing: string[];
  canSit: boolean;
}

/** 按骨骼里实际有的动作定下对应关系。idle 都找不到时用第一个动作 */
export function resolveAnims(cfg: SpineConfig, states: readonly string[], available: readonly string[]): AnimMap {
  if (!available.length) throw new Error("骨骼文件里没有动作");
  const has = new Set(available);
  const find = (state: string): string | undefined => {
    const own = cfg.anims[state];
    if (own && has.has(own)) return own;
    return (DEFAULT_ANIMS[state] ?? []).map((n) => n.replaceAll("{g}", cfg.group)).find((n) => has.has(n));
  };
  const idle = find("idle") ?? available[0];
  const map: Record<string, string> = {};
  const missing: string[] = [];
  for (const state of states) {
    const name = state === "idle" ? idle : find(state);
    if (!name) missing.push(state);
    map[state] = name ?? idle;
  }
  return { map, missing, canSit: find("sit") !== undefined };
}
