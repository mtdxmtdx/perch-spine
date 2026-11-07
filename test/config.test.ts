import assert from "node:assert/strict";
import { test } from "node:test";
import { nextSeated, parseConfig, resolveAnims } from "../src/config.ts";

const base = { skeleton: "a.skel", atlas: "a.atlas.txt" };

test("spine.json：缺文件名报错，其余用默认值", () => {
  assert.throws(() => parseConfig({ atlas: "a" }), /skeleton/);
  assert.throws(() => parseConfig(null), /对象/);
  const c = parseConfig(base);
  assert.deepEqual([c.skin, c.group, c.flip, c.sitOffsetY, c.height, c.pma], ["default", "cute", true, undefined, 208, undefined]);
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

test("坐姿：安静时不用聊天动作，说话时才用；没有坐姿版的用安静坐姿", () => {
  const cfg = parseConfig({ ...base, group: "cool" });
  const r = resolveAnims(cfg, ["idle", "sit"], ["cool_idle1_0", "cool_idle1_sit_0", "cool_sit_sit_1", "cool_sad1_sit_0"]);
  assert.equal(r.map.sit, "cool_idle1_sit_0");
  assert.equal(r.seated.talk, "cool_sit_sit_1");
  assert.equal(r.seated.error, "cool_sad1_sit_0");
  assert.equal(r.seated.think, "cool_idle1_sit_0");
});

test("坐姿：anims 用 sit_<状态> 覆盖", () => {
  const cfg = parseConfig({ ...base, anims: { sit_talk: "x" } });
  assert.equal(resolveAnims(cfg, ["idle"], ["cute_idle_0", "cute_sit_sit_1", "x"]).seated.talk, "x");
});

test("坐姿：说话、思考时继续坐着，走路、下落、待机算站起来", () => {
  assert.equal(nextSeated(false, "sit"), true);
  assert.equal(nextSeated(true, "talk"), true);
  assert.equal(nextSeated(true, "think"), true);
  assert.equal(nextSeated(false, "talk"), false);
  for (const a of ["idle", "walk_left", "fall", "drag", "sleep"]) assert.equal(nextSeated(true, a), false);
});

test("动作：没有坐姿不能坐；连待机都没有时用第一个动作", () => {
  const r = resolveAnims(parseConfig(base), ["idle", "sit"], ["foo", "bar"]);
  assert.equal(r.canSit, false);
  assert.deepEqual(r.map, { idle: "foo", sit: "foo" });
  assert.throws(() => resolveAnims(parseConfig(base), ["idle"], []), /没有动作/);
});
