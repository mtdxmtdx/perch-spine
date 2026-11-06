# perch-spine

[Perch](https://github.com/mtdxmtdx/Perch) 桌宠的 Spine 渲染器插件：让 Perch 播放 Spine 4.0 骨骼模型，包括走路、说话、坐在窗沿上这些动作。

本仓库**不含任何模型或游戏素材**，模型文件要你自己准备。

## 安装

1. 构建：

   ```bash
   npm install
   npm run build
   ```

2. 把 `dist/perch-spine/` 里的文件复制到 `%APPDATA%\Perch\plugins\spine\`。
3. 按 [皮肤格式](docs/skin-format.md) 准备一个皮肤文件夹，在 Perch 里导入并选中。

找不到插件或加载出错时，Perch 会改用占位形象，错误信息在桌宠窗口的控制台里。

跳跃时的朝向需要 Perch 发送 `pet-facing` 事件；旧版 Perch 也能用，只是跳跃时沿用上次走路的方向。

## 开发

```bash
npm test            # 单元测试
npm run typecheck   # 类型检查
npm run build       # 打包到 dist/perch-spine
npm run list-anims -- <文件.skel>       # 列出模型里的皮肤和动作
npm run preview -- <素材文件夹> <分组>   # 不启动 Perch，在浏览器里预览，打开 http://127.0.0.1:5199/
```

素材放在仓库里的 `ykn/` 或 `models/` 时已被 git 排除。不要把模型文件提交到仓库。

## 授权

- 本插件自己的代码：[PolyForm Noncommercial 1.0.0](LICENSE)，禁止商用。
- 打包进插件的 Spine 运行库：[Spine Runtimes License](LICENSE-SPINE.txt)，版权归 Esoteric Software。分发时必须带上这份许可证。

**使用**这个插件不需要 Spine 授权。**修改**运行库或在它之上二次开发，需要你自己持有 [Spine 编辑器授权](https://esotericsoftware.com/spine-purchase)。

这是给 Perch 用的渲染器插件，不是给其他程序用的 Spine 开发库。

模型和美术素材的版权归各自的权利人。本仓库不提供，也不提供下载工具；你用什么素材、怎么用，由你自己负责。
