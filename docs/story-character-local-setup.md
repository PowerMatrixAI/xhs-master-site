# 临时故事角色库

五个故事模板各有两张主角形象图，位于 `public/story-characters/`，使用内置 imagegen 生成。

角色数据入口是 `src/lib/storyCharacters.ts` 的 `getStoryCharacters` / `resolveStoryCharacter`。后续服务端列表接口接入时替换该入口，并保留旧静态图以支持已保存任务。

## 公网与本地交付

部署环境设置 `STORY_CHARACTER_PUBLIC_BASE_URL=https://实际公网站点域名`，并确保 `/story-characters/*.png` 可公开下载。服务端生成任务时据此拼接角色下载链接。

没有配置时任务使用附件交付：用户在角色区点击“下载角色图”，将图片与任务指令一起交给智能体。主会话把图片放入根任务目录 `character-reference.png`。不会把 localhost 链接写入远端任务。

## 首帧与缓存

真实背景直接与角色图多图编辑；AI 背景先生成无角色底图，再与角色图多图编辑。首帧准备结束后，主会话对照角色图验收，再渲染视频。

每份方案在 `.tasks/xhs-video-task-{id}/runs/{fingerprint}/` 保存中间产物。指纹包含角色配置、首帧计划与动态计划。同方案可续跑，不同角色或分镜使用不同缓存。成片与清单写回原来的统一路径，草稿箱无需变更。

## 图片生成规格

十张图片分别使用独立内置 imagegen 请求生成，公共提示词为：单个完整全身角色，柔和雕塑感的 3D 动画风格，正面三分之四站姿，浅灰干净背景，柔光，无文字或 Logo。

- `cat-orange.png`：橘白小猫，绿色邮差挎包。
- `cat-gray.png`：灰白小猫，蓝色邮差挎包。
- `niu-brown.png`：橙棕色拟人小牛，浅色口鼻，无服装配饰，外观以预设参考图为准。
- `niu-black-white.png`：黑白小牛，黄色围巾，平台原创临时形象。
- `dog-corgi.png`：金白柯基幼犬，蓝色探索背心、红色指南针吊牌和地图小包。
- `dog-black.png`：黑白小狗，黄色雨衣和深蓝地图挎包。
- `fox-red.png`：赤红小狐狸，深蓝月纹短斗篷和弯月提灯。
- `fox-silver.png`：银灰小狐狸，苔绿针织围巾和月牙挂饰提灯。
- `rabbit-white.png`：白色垂耳小兔，深蓝站务帽、制服和棕色票夹挎包。
- `rabbit-brown.png`：肉桂棕垂耳小兔，砖红针织衫、棕色背包和黄铜怀表。

## 检查

执行 `node scripts/test-story-characters.cjs` 检查角色归属、角色传递、公网/附件路径和紧凑故事任务。测试使用模拟 AI 返回，不调用付费服务。
