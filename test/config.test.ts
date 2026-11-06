import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig, resolveAnims } from "../src/config.ts";

const base = { skeleton: "a.skel", atlas: "a.atlas.txt" };

test("spine.json：缺文件名报错，其余用默认值", () => {
  assert.throws(() => parseConfig({ atlas: "a" }), /skeleton/);
  assert.throws(() => parseConfig(null), /对象/);
  const c = parseConfig(base);
  assert.deepEqual([c.skin, c.group, c.flip, c.sitOffsetY, c.height, c.pma], ["default", "cute", false, undefined, 208, undefined]);
});

test("动作：按性格分组拼名字，找不到退回待机", () => {
  const cfg = parseConfig({ ...base, group: "cool" });
  const r = resolveAnims(cfg, ["idle", "walk_left", "sit", "error"], ["cool_idle_0", "mob_walk_0", "cool_sit_sit_2", "cute_sad_0"]);
  assert.deepEqual(r.map, { idle: "cool_idle_0", walk_left: "mob_walk_0", sit: "cool_sit_sit_2", error: "cool_idle_0" });
  assert.deepEqual(r.missing, ["error"]);
  assert.equal(r.canSit, true);
});

test("动作：anims 覆盖优先，写错的名字不生效", () => {
  const cfg = parseConfig({ ...base, anims: { talk: "x_talk", sleep: "nope" } });
  const r = resolveAnims(cfg, ["idle", "talk", "sleep"], ["cute_idle_0", "cute_sleepy_0", "x_talk"]);
  assert.equal(r.map.talk, "x_talk");
  assert.equal(r.map.sleep, "cute_sleepy_0");
});

test("动作：没有坐姿不能坐；连待机都没有时用第一个动作", () => {
  const r = resolveAnims(parseConfig(base), ["idle", "sit"], ["foo", "bar"]);
  assert.equal(r.canSit, false);
  assert.deepEqual(r.map, { idle: "foo", sit: "foo" });
  assert.throws(() => resolveAnims(parseConfig(base), ["idle"], []), /没有动作/);
});
