// 从骨骼的包围盒算画面范围和 Perch 要的位置比例。纯逻辑，不碰 WebGL。

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function unionBox(a: Box, b: Box): Box {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export interface Frame {
  /** 画面对应的骨骼坐标范围 */
  world: Box;
  cellW: number;
  cellH: number;
  footRatio: number;
  centerRatio: number;
  topRatio: number;
}

/**
 * idle：待机姿势的包围盒，定头顶位置；all：所有动作的并集，定画面范围，保证不被裁掉。
 * 骨骼原点是脚底中心：水平以原点对称（翻转时不会跳），脚底线就是 y=0。
 */
export function computeFrame(idle: Box, all: Box, cellH: number, pad = 0.05): Frame {
  const half = Math.max(Math.abs(all.minX), Math.abs(all.maxX));
  const top = Math.max(all.maxY, idle.maxY, 1);
  const bottom = Math.min(all.minY, 0);
  const margin = (top - bottom) * pad;
  const world: Box = { minX: -half - margin, maxX: half + margin, minY: bottom - margin, maxY: top + margin };
  const h = world.maxY - world.minY;
  const w = world.maxX - world.minX;
  return {
    world,
    cellH,
    cellW: Math.round((cellH * w) / h),
    footRatio: world.maxY / h,
    centerRatio: 0.5,
    topRatio: (world.maxY - idle.maxY) / h,
  };
}
