import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFrame, unionBox } from "../src/layout.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("脚底在 y=0，水平以原点对称，头顶按待机姿势算", () => {
  const idle = { minX: -40, minY: 0, maxX: 40, maxY: 100 };
  const all = { minX: -60, minY: 0, maxX: 30, maxY: 120 };
  const f = computeFrame(idle, all, 240, 0);
  assert.deepEqual(f.world, { minX: -60, maxX: 60, minY: 0, maxY: 120 });
  assert.equal(f.cellW, 240);
  near(f.footRatio, 1);
  near(f.centerRatio, 0.5);
  near(f.topRatio, 20 / 120);
});

test("动作低于脚底时画面向下扩，脚底线不变", () => {
  const idle = { minX: -10, minY: 0, maxX: 10, maxY: 100 };
  const f = computeFrame(idle, unionBox(idle, { minX: 0, minY: -25, maxX: 0, maxY: 0 }), 100, 0);
  near(f.footRatio, 100 / 125);
});

test("留边不改变比例关系", () => {
  const b = { minX: -50, minY: 0, maxX: 50, maxY: 100 };
  const f = computeFrame(b, b, 200, 0.1);
  near(f.world.maxY, 110);
  near(f.world.minY, -10);
  near(f.footRatio, 110 / 120);
  near(f.topRatio, 10 / 120);
});
