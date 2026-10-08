# 视频时间线 v2 联调与上线

## 当前状态

控制台与本机 xiaohongshu_auto_op 已实现可变时长、结构化转场、旁白实测调时。默认不启用新版输出；服务端环境变量 `VIDEO_TIMELINE_V2_ENABLED=true` 是上线开关。不设置时新脚本仍走旧流程，旧缓存脚本继续输出 version=1。

2026-10-08 向北京接口的3秒真实请求返回 HTTP 429、code=1102、`Account balance not enough`，request_id 为 f50ebcf1-91a1-47ad-afce-d9b1b626642d。这不证明时长能力。7秒、15秒请求未继续提交。本地执行器还缺少 VOLCENGINE_TTS_API_KEY / VOLCENGINE_TTS_SPEAKER，真实成片验收尚未完成。

## 共享协议

新脚本标记 timingVersion=2，执行计划标记 version=2。每镜 duration 为参与剪辑的长度，2–10秒、0.5秒步进；最后一镜 transitionToNext=null，其余镜头的 transitionToNext 包含 type、duration、reason、outgoingState、incomingState。

cut 的 duration=0；dissolve 为0.25/0.5/0.75秒且不超过相邻较短镜头的四分之一。整片时长扣除重叠。故事脚本含已确认 narrationText，动态阶段不得改写。

执行器保留原 plan.json；resolved-plan.json记录每镜实际长度、生成长度、裁切区间、起止帧、转场、原旁白长度和加速比。原始素材单独缓存，重新剪辑不覆盖原始素材。

## 执行与缓存

继续使用 story-video / featured-vlog 的 prepare、render、reset。prepare后逐张验收首帧；render后观看动作完整性与转场观感，技术校验不能代替视觉验收。

故事模式先生成全部原始TTS，测量后确定时间线。每镜最多延长2秒、最高12秒；仍超时才最多1.25倍加速；全片超过60秒或仍超时，在生成视频前失败。旁白避开入场和出场叠化，两端各留至少0.15秒，24fps向内对齐。先合成无声画面，再铺设全片旁白。

Vlog按脚本剪辑，最后将平台配乐适配实际总长。最终只有一条AAC音轨。

仅改转场类型/重叠时长可复用视频；生成时长、首帧、动态提示词或模型改变时更新相应视频缓存。旁白文本、模型、声音改变时更新音频缓存。reset清除指定镜头的视频与请求记录及派生结果，保留原始旁白；仅核实旧请求失败后reset。Kling超时重跑render会查询原task_id，不自动重复提交。

## 验收与启用顺序

1. 控制台运行 `node scripts/test-video-timeline.cjs`、`node scripts/test-story-characters.cjs`、`npm run build`。
2. 执行器运行 `uv run --with pytest python -m pytest tests/test_video_timeline.py tests/test_story_video.py tests/test_featured_vlog.py tests/test_video.py tests/test_speech.py tests/test_video_concat.py -q`。新增测试使用本地测试图形和音调替代生成服务，真实运行FFmpeg，覆盖混合转场、时长、黑帧/冻结检测、旁白调时和重试缓存，不代表真实模型验收。
3. 额度就绪后，在当前北京接口用 `generate-video --first-frame-image <本地图片绝对路径> --video-prompt <动态描述> --duration 3 --sound off` 验证3秒，再分别验证7秒和15秒，等待完成并用ffprobe确认时长。
4. 配置TTS，分别完成一条真实Vlog、一条真实故事的prepare→首帧验收→render→成片验收。接口不支持时停止，不静默换模型或降级。
5. 先交付兼容v1/v2的执行器，再设置控制台 `VIDEO_TIMELINE_V2_ENABLED=true` 并重启。回滚关闭开关；已有v2脚本保留但停止创建新任务，不能按v1执行。

不需要新增业务后端接口。两个仓库独立提交、交付。
