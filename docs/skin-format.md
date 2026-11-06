# 皮肤格式

一个皮肤是一个文件夹，可以用 Perch 的皮肤导入功能安装（文件夹或 zip）：

```
<名字>/
├─ pet.json     皮肤名
├─ skin.json    选用这个渲染器
├─ spine.json   模型配置
├─ 骨骼文件.skel
├─ 图集.atlas.txt
└─ 贴图.png     文件名要和图集第一行写的页名一致
```

`pet.json`：

```json
{ "id": "my-pet", "displayName": "我的桌宠" }
```

`skin.json`：

```json
{ "renderer": "spine" }
```

`spine.json`：

```json
{
  "skeleton": "model.skel",
  "atlas": "model.atlas.txt",
  "group": "cool"
}
```

| 字段 | 说明 | 默认 |
|---|---|---|
| `skeleton` | 骨骼文件（Spine 4.0 二进制格式） | 必填 |
| `atlas` | 图集描述文件 | 必填 |
| `skin` | Spine 皮肤名 | `default` |
| `group` | 性格分组，默认动作名里的 `{g}`：`cute`、`cool`、`pure`、`passion` | `cute` |
| `flip` | 模型原本朝左。原本朝右的模型写 `false` | `true` |
| `sitOffsetY` | 坐着时骨骼的纵向偏移，让座位贴住窗口顶边、腿垂在下面 | 按身高估 |
| `height` | 画面基准高度（逻辑像素） | `208` |
| `pma` | 贴图是否预乘透明度 | 看图集的 `pma` |
| `hide` | 不画的部件（图集里的区域名） | `["shadow"]` |
| `anims` | 逐个状态指定动作，比如 `{ "working": "cool_book_1" }` | 见下 |

## 动作对应

默认按下面的顺序找第一个存在的动作，`{g}` 换成 `group`。用 `npm run list-anims -- <文件.skel>` 看模型里有哪些动作。

| 状态 | 动作 |
|---|---|
| `idle` | `{g}_idle_0`、`{g}_idle1_0`、`mob_idle_0` |
| `walk_left`、`walk_right` | `mob_walk_0`，向哪边走就翻转到哪边 |
| `talk` | `{g}_talk_1` |
| `wave` | `{g}_lough_0`、`{g}_smile_0`、`{g}_talk_2` |
| `jump`、`fall`、`attention` | `{g}_surprised_0`、`{g}_suprised_0` |
| `drag` | `{g}_panic_0`，然后同上 |
| `land` | `{g}_idle_0`、`{g}_idle1_0` |
| `sleep` | `{g}_sleepy_0`、`{g}_sleepy1_0` |
| `sit` | `{g}_sit_sit_1`、`{g}_sit_sit_2`，有才会坐在窗沿上 |
| `listen` | `{g}_listen_0` |
| `think` | `{g}_question_0`、`{g}_question1_0` |
| `working` | `{g}_idle2_0`、`{g}_uttori_0` |
| `error` | `{g}_sad_0`、`{g}_sad1_0` |
| `done` | `{g}_lough_0`、`{g}_smile_0`、`{g}_uttori_0` |

找不到的状态用待机代替，并在控制台记一条警告。
