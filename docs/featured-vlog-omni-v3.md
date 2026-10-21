# 精选 Vlog Omni v3 交付与联调

控制台负责脚本、图片分析选图和配乐选择；智能体查看实际场景图，细化摄影与光学关系，通过 Kling MCP 全能参考生成；独立执行器负责确定性后期。创意故事只接入图片分析选图，模型与旁白流程不变。

## 启用

先部署 `public/video-references/jinsanjiao-first-10s-v1.mp4`，验证公网 HTTPS 可下载。原文件10秒、7,009,600字节。本站根目录完整原视频及实验输出不随本次功能提交。

服务端配置：

```dotenv
VIDEO_REFERENCE_PUBLIC_ORIGIN=https://你的已部署站点
FEATURED_VLOG_OMNI_ENABLED=true
```

默认关闭，不自行把localhost或临时签名链接写入远程任务。部署环境还需安装含 `scripts/xhs/featured_vlog_omni.py` 的执行器；Kling MCP由执行智能体授权，林川image主体324475410205532需在该账号中可访问。不能用API Key账号可用性代替MCP权限检查。

先启用兼容执行器再开控制台开关。关闭开关不删除旧脚本，但拒绝继续为v3脚本组装新任务；既有v1/v2任务走原流程。新脚本记录productionVersion=3/timingVersion=2/sceneVersion=1，旧缓存不自动升级。

## 协议

`plan.json version=3 kind=featured_vlog`：generation固定Kling MCP、kling-video-v3_0_omni、9:16、720p、单条静音；output为1080x1920/24fps。每镜sceneReference含source、imageUrl或生成描述、选中分析快照和选图依据；direction含摄影、运镜、动作、分段秒数及结束画面。transitionToNext继续cut/dissolve，最后为null。

保留角色A、林川外观和主体ID，允许无人/POV/手部/正面/侧面/背面。风格视频只提供摄影、色彩和节奏参考，不能复制内容或切镜。真实素材不先重绘为含人物首帧；无匹配素材时先制作AI场景参考。

控制台按全部有效图片的aiAnalysis优先筛选，标签/文件名补充；无分析不排除，deleted分析不发送。超过14,000字符候选预算时分批最多每镜选2张、递归汇总；无效返回或不能收敛明确报错，不静默丢弃尾部素材。每轮均在现有后端用户凭据上下文中执行。

智能体先运行featured-vlog prepare，生成resolved-plan.json骨架。每镜sourceHash用于检测脚本/场景/主体/模型变化；转场和音乐单独处理。骨架scenePath、clipPath为绝对路径，须按路径保存图像和视频。

读图后填写refinement：imageObservations、personAction、cameraMovement、timing、endingState、integration数组、constraints数组、prompt。timing连续覆盖确认duration。图片不支持核心动作则报告，不换图改剧情。真实图片和AI场景均须读图。

调用MCP前核对当前工具schema。request保存实际model、arguments对象和inputs对象；arguments.elements保存数组（即使MCP传输层要求JSON字符串，落盘须解析为数组），有主体为 `[{"id":"324475410205532","bindName":"林川","type":"image"}]`，无人为[]。inputs.image_1/video_1记录实际上传的HTTPS URL，generationId在提交成功时立即保存，超时续查原任务。

对实际scenePath和clipPath计算sceneSha256、clipSha256；观看后写visualReview={passed:true,notes:具体检查结果}，不得用ffprobe替代视觉验收。主体身份、落点、受光、遮挡、建筑稳定性、动作、内部切镜都须检查。

render只接收外部片段，验证记录和文件后裁切、合成转场、混配乐，不调用旧prepare/render的图片或Turbo生成。resolved-plan.json保留细化和任务记录并增加实际timeline。只改转场/音乐可以prepare并复用已验证视频。reset保留原始片段与任务历史，改用新clipPath，清除发布用结果索引。

## 验证与边界

控制台：`node scripts/test-vlog-omni.cjs`、`node scripts/test-vlog-scenes.cjs`、`node scripts/test-video-timeline.cjs`、`node scripts/test-story-characters.cjs`、`node scripts/test-asset-analysis.cjs`、`npm run build`。

执行器：`uv run --with pytest python -m pytest tests/test_featured_vlog_omni.py tests/test_featured_vlog.py tests/test_video_timeline.py -q`。测试使用本地生成的图形和音调，不消耗Kling额度、不代表真实摄影观感验收。

真实验收需公网参考资源可用、执行环境更新、MCP额度就绪。用包含环境/人物/细节的一条3–6镜视频检查主题与转场、人物道具、实际无内部切镜、9:16、24fps及单AAC配乐。记录实际费用和返工，不沿用报告中的历史单价。参考视频模式可能影响服务端自动分镜，即使请求prefer_multi_shots=false也必须检查结果。

本轮未新增参考视频/主体管理页，后续将集中配置替换为平台素材记录。生成任务公共规则不重复堆入每镜，18000字符作为提示词预算与回归目标，不用截断方式破坏JSON。
