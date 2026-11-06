// Perch 渲染器插件接口（docs/renderer-plugin.md）里这个插件用到的部分。

export interface SkinSource {
  info: { id: string; name: string } | null;
  readFile(path: string): Promise<ArrayBuffer>;
}

export interface HitMask {
  w: number;
  h: number;
  bits: number[];
}

export interface LiveMask {
  sample(source: HTMLCanvasElement, force?: boolean): HitMask | null;
  reset(): void;
}

export interface PluginApi {
  apiVersion: number;
  anims: readonly string[];
  LiveMask: new (minIntervalMs?: number) => LiveMask;
  registerRenderer(name: string, create: () => unknown): void;
}
