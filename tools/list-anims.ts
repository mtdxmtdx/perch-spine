// 列出 .skel 里的皮肤和动作：npm run list-anims -- <文件>
import { readFileSync } from "node:fs";
import { AtlasAttachmentLoader, SkeletonBinary, TextureAtlas } from "@esotericsoftware/spine-core";

/** 只读名字，不需要真的图集：什么部件都给一块假区域 */
const region = { u: 0, v: 0, u2: 1, v2: 1, width: 1, height: 1, originalWidth: 1, originalHeight: 1, offsetX: 0, offsetY: 0, degrees: 0, page: { width: 1, height: 1 } };
const atlas = new TextureAtlas("");
atlas.findRegion = () => region as never;

const file = process.argv[2];
const data = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(readFileSync(file)));
console.log(`Spine ${data.version}，骨骼 ${data.bones.length}，插槽 ${data.slots.length}`);
console.log(`皮肤：${data.skins.map((s) => s.name).join(", ")}`);
console.log(`动作 ${data.animations.length} 个：`);
for (const a of data.animations) console.log(`  ${a.name}  ${a.duration.toFixed(2)}s`);
