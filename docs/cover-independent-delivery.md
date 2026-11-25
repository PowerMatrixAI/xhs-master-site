# 三风格封面逐版交付实施与验收

## 实施边界

控制台分支 v2.0.0/temp；Skill 分支 main。业务服务端接口和视频流程不变。旧整批封面继续兼容。

## 控制台

- `NEXT_PUBLIC_COVER_SINGLE_TASK_ENABLED=true` 才启用新版逐版入口，默认关闭。需先部署支持 `cover-image` 的 Skill，再设置该环境变量并重启/重新构建控制台。
- 沿用 image 作品和 remote_images 任务。每版 imageCount=1、独立 requestId、最新 productionRevision。标题为原始主题加风格名。
- settings.coverDraft.batches 保存 version=1 批次、原图与设计快照、每版指纹、requestId、taskId及提交快照。保存顺序与提交顺序串行。
- 原请求响应不明时先按 requestId 查找，不换 ID；只在明确不存在且原请求快照完整时重发原参数。冲突和查询错误暂停剩余提交。原结果不可核实时提示继续核查，不冒险重投。
- 本地先保存提交快照，后台作品保存批次历史；刷新恢复时合并服务端记录和本地未决请求，不能用过时 revision 覆盖。
- 作品固定显示三版结果与历史。单版修改仅该版过期，原图/全局文字变更影响所有版本。正在运行和未决任务不允许创建新付费周期。
- 单版失败后“重新制作此版本”是用户主动开启新周期，明确提示费用；不会自动重新生成其他版本。

## Skill

`cover-image prepare/status/generate/recover/review/delivery` 支持 kind=cover_image/version=1。

- 真实原始文件另存；标准化输入PNG并记录哈希。
- generate先原子持久化调用和次数，再调用现有编辑通道。修复同时输入原图、上一版成品，最多两次。
- 生成结果保存回执、请求、输出和哈希；保留供应商原文件，生成不拉伸的1536×2048交付画布。
- review必须绑定当前输出哈希；语义观察由Hermes完成，程序不伪造视觉判断。
- 两次后未通过为failed，无合格artifacts；成功版单独delivery。重复delivery不调用生成。
- unknown禁止重新生成；已有真实回执和文件可recover，不能借恢复清零预算。
- HTTP重试/供应商备用不等同于视觉修复次数，不能承诺最多三笔供应商扣费。
- docker/SOUL.md及bootstrap的封面策略段同步更新已有profile，不影响视频策略。

## 已完成离线验证

- `node scripts/test-cover-batch.cjs`：顺序提交、响应丢失找回、原参数重发、冲突停止、查询失败停止、逐版失效、单版计划与修复上限。
- `node scripts/test-cover-production.cjs`：原有三风格规划、文字和通用图片接口适配。
- `node scripts/test-vlog-production.cjs`：既有视频阶段回归。
- TypeScript无输出类型检查、两仓库diff检查。
- Skill `tests/test_cover_image.py`：6项通过，覆盖首次/一次修复/两次修复成功、耗尽失败、未知请求禁止重投、回执恢复、哈希和计划不可变。
- Skill `test_hermes_container.py -k 'bootstrap_upgrade or existing_profile_approval'`：5项通过；不是全量Skill测试通过的声明。

## 待部署后的真实验收

用户已确认自行部署后通知。当前不启动新协议真实图片制作，也不执行视频制作。

1. 在已部署镜像的实际用户profile验证 `cover-image --help`，确认新代码与封面策略已安装。
2. 开启本地控制台NEXT_PUBLIC_COVER_SINGLE_TASK_ENABLED并重启。
3. 同一真实原图，一次提交三版；记录各自请求ID、业务任务ID、revision、实际费用/耗时（执行服务提供时）及修复次数。
4. 检查三版独立回传；逐张查看文字、场景、风格和1536×2048尺寸。
5. 刷新、返回作品与查看历史；检查完成状态和图片恢复。未通过版保留真实失败，不为了完成测试强制放行。

控制台提交同时包含生成任务页面移除按钮、统一筛选样式的调整。真实生成验收仍待执行器部署后进行。
