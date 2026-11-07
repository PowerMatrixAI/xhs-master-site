# 精选 Vlog Omni v3 交付与联调

控制台负责脚本、图片分析选图和配乐选择；智能体读取xiaohongshu_auto_op Skill，查看实际场景图，细化摄影与光学关系，再直接执行官方 `kling` CLI完成Omni全能参考生成；Python执行器负责确定性后期。创意故事只接入图片分析选图，模型与旁白流程不变。

## 启用

管理员先在“平台管理 → 参考视频”上传或登记后端视频，再在精选Vlog模板中选择关联。任务生成从服务端重新读取模板，使用匹配的referenceVideoId/referenceVideo详情。缺少关联、详情失效或地址非法会在AI规划前报错，不回退到前端静态视频。

服务端配置：

```dotenv
FEATURED_VLOG_OMNI_ENABLED=true
```

默认开关配置不自动修改；启用前需模板已关联可下载的HTTP/HTTPS地址，并部署含 `scripts/xhs/featured_vlog_omni.py` 的执行器。已移除VIDEO_REFERENCE_PUBLIC_ORIGIN依赖，旧静态文件保留给历史任务。Hermes已安装官方CLI；执行前确认版本>=0.2.3及其OAuth登录，林川image主体324475410205532需在该账号中可访问。无需配置宿主MCP工具；CLI处理传输与授权，不读取/复制凭据。

先启用兼容执行器再开控制台开关。关闭开关不删除旧脚本，但拒绝继续为v3脚本组装新任务；既有v1/v2任务走原流程。新脚本记录productionVersion=3/timingVersion=2/sceneVersion=1，旧缓存不自动升级。

精选Vlog新生成脚本的整片时长为20–30秒（各镜时长之和扣除叠化重叠），提示词要求与返回结果校验同时生效。仍为3–6镜、每镜2–10秒、0.5秒步进，生成后不得通过拉伸或截断剧情强凑总长；不合格结果明确报错。既有缓存脚本/计划的确认时间线不自动修改，创意故事仍采用原20–40秒创作目标。

## 协议

`plan.json version=3 kind=featured_vlog`：generation.provider=kling_cli、tool=omni_ref_video，显式指定kling-video-v3_0_omni、9:16、720p或1080p、单条静音；output为1080x1920/24fps。每镜sceneReference含source、imageUrl或生成描述和选中分析快照；direction含摄影、运镜、动作、分段秒数及结束画面。transitionToNext继续cut/dissolve，最后为null。旧provider=kling_mcp计划及已完成片段仍兼容后期；需要新生成时重新组装CLI任务，不静默换通道或自动重提旧任务。

### 制作草稿与阶段恢复

新Omni脚本记录genericCharacterVersion=1，通用游客且无服装配件依赖时直接绑定预设主体，0次人物AI调用。旧文本或无人转换只请求字段补丁；程序保留镜头职责、顺序、地点、时间线及转场类型，AI适配需在“本次制作脚本”中采用后继续，原确认脚本不覆盖。

制作草稿使用独立IndexedDB数据库xhs-vlog-production，按登录uid、业务后端地址、账号与模板隔离，保留当前修订及最近成功结果。每阶段立即保存输入指纹、规则版本、结果、实际返回模型及异步UUID。阶段依赖为：适配依赖原脚本及角色版本；选图依赖内容投影及素材分析；选曲依赖主题/情绪/节奏及曲库；组装依赖完整制作设置与资源。清晰度改变仅重新组装；选图/选曲可显式重选。下载URL签名更新不触发AI，但会更新最终指令。

处理中UUID刷新后只续查，404或提交结果不确定时需要用户明确重新执行，不自动重投。保存笔记失败有独立“重试保存”，不再规划AI或刷新素材。当前处理中任务仍在服务内存中，不能跨服务重启恢复；本地草稿不跨设备同步。AI使用后端默认模型策略，实际模型记录在阶段结果；后端默认模型切换未提供版本接口，需更新制作规则版本或显式重选来淘汰已有结果。

本地缓存落盘失败时保留内存结果并停止推进，页面明确提示刷新恢复不可保证。Web Locks防止同一制作草稿跨标签页并发执行；设置变化或脚本换版后重新检查缓存依赖。已有业务笔记接口继续保存最终指令，不新增业务后端字段。

### 出镜与清晰度规则

- 第二步可选林川（324641305202280）、沈禾（325994250221723）或none（不添加人物），按账号/模板保存；旧缓存默认林川。请求字段featuredVlogCharacter只接受linchuan/shenhe/none，不能提交自定义主体对象覆盖目录。
- 新生成脚本标记characterSelection=unassigned，第一步只规划通用游客A，不写具体姓名、性别、发型服装；第二步无论选择哪位主体均先完成制作适配，不因默认选项是林川而跳过。旧脚本保留历史语义，不自动改写。
- 更换初始人物或选择无人时先调用内部adapt_featured_vlog_character生成制作脚本，再选场景、配乐和组装任务。制作脚本标记characterSelection，原确认脚本不覆盖；保持场景、顺序、时长、转场类型/重叠、动作分段秒数。换人保留出镜安排，无人则将体验改为环境呈现，不使用手部/剪影代替。
- plan.characterSelection记录所选模式；实际有人时character来自预设目录，全片无人省略character。旧Skill已按plan.character读取主体，无需再固定人物；Hermes执行前element_get检查账号权限，人物不可访问时报错不替换。不添加人物需检查并处理原素材已有人员。

- 按模板内容决定人物：风景/地点建立默认无人，体验动作按需绑定林川，不设人物镜头比例。每镜subjectPresence写入任务，environment必须起止无人且无入场离场；POV仅实际可见人物局部时绑定，全片无人不输出character。旧执行任务缺少subjectPresence时兼容原状态判断。
- 读图后空间充分时设计中等幅度、有明确起幅与终幅变化的运动，静观细节可固定；不编造米数、隐藏空间或建筑背面。最终拍法和理由记入refinement并实际验收。
- 第二步选择生成清晰度，默认720P放大输出，1080P直接以Kling 1080p生成，不能降级或放大冒充；最终均1080x1920/24fps。设置按账号/模板写浏览器工作区，不改脚本；修改后旧任务提示重新生成，旧缓存默认720P。
- API请求新增可选featuredVlogResolution（720p/1080p），只用于任务组装；非法值拒绝，旧版脚本不能请求1080p。先部署双清晰度执行器，再部署控制台。Hermes须同步执行器；本地修改不会自动同步远端机器。
- 生成清晰度参与已有片段hash；请求记录、CLI显式参数必须一致，1080p源片至少1080x1920，否则后期失败。实拍细节和水印不由清晰度设置保证，真实付费对比验收需另行确认。

最终指令采用显式字段白名单（含嵌套状态、摄影与时间线），完全不输出account/noteTask对象；任务编号仅用于工作目录与交付追踪。只携带已确认制作概要、选中场景参考及简短分析、主角、模板参考视频、选定配乐、镜头设计和执行要求。账号策划、爆款研究、全量素材、周计划、专家规则和上一版任务正文仅用于控制台内部，不进入最终执行JSON。选图理由保留在控制台预览，不写入执行计划。

保留角色A、林川外观和主体ID，允许无人/POV/手部/正面/侧面/背面。参考视频purpose=style_and_texture：只参考摄影质感、色彩、明暗和材质，不复制内容或照搬运镜、切镜、时间安排；当前场景图决定空间事实、时间和主要光线。真实素材不先重绘为含人物首帧；无匹配素材时先制作AI场景参考。

## 模板编辑

管理员填写模板名称、视频主题与整体主线、镜头名称/主要内容/是否必须保留、视角指导、画面总指导、参考视频和音乐标签。主要内容说明观看重点及主题关系，具体机位、路径、运镜方式和幅度在读图时调整；核心内容不可支持时报告。新增镜头默认不勾选必需，已有必需设置保留。

原逐镜画面指导和必须出现场景从编辑表单移除，旧记录未保存前仍保存在后端，但新脚本通过字段白名单不再读取它们。保存模板时旧API的beats[].visualGuidance写空字符串、requiredScenes写空数组；主要内容仍通过shotDuty字段传输，整片visualGuidance继续有效。无需修改后端接口或自动批量迁移；管理员编辑旧模板时会看到清空提示。

控制台按全部有效图片的aiAnalysis优先筛选，标签/文件名补充；无分析不排除，deleted分析不发送。超过14,000字符候选预算时分批最多每镜选2张、递归汇总；无效返回或不能收敛明确报错，不静默丢弃尾部素材。每轮均在现有后端用户凭据上下文中执行。

智能体先运行featured-vlog prepare，生成resolved-plan.json骨架。每镜sourceHash用于检测脚本/场景/主体/模型变化；转场和音乐单独处理。骨架scenePath、clipPath为绝对路径，须按路径保存图像和视频。

新计划styleVideo={source:"template",id,name,version,url,maxDuration:10}，template.referenceVideoId与其id一致；不再固定“金三角”或10秒源视频。prepare从url下载并保留原文件，检查有效视频流：不足3秒失败，3–10秒完整使用，超过10秒取前10秒；转换为静音MP4/30fps，返回styleVideoPath。resolved-plan.json记录后端视频ID/版本/来源地址、原时长和实际使用时长。视频ID、版本或地址变化会使旧视频生成缓存失效。

读图后填写refinement：imageObservations、personAction、cameraMovement、timing、endingState、integration数组、constraints数组、prompt。timing连续覆盖确认duration。图片不支持核心动作则报告，不换图改剧情。真实图片和AI场景均须读图。

主会话先执行 `kling --version`、`kling who_am_i`、`kling account`、`kling omni_ref_video --help`、`kling element_get 324475410205532`。模型参数与flag映射依据实时能力和帮助，不靠默认值，不自行换模型。

生成命令使用 `kling omni_ref_video --model kling-video-v3_0_omni`，通过--image、--video传prepare返回的绝对路径，本地文件由CLI自动上传。模板参考视频必须使用styleVideoPath，不能直接把原长视频URL传给--video绕过时长处理。--elements传JSON数组字符串，prompt使用<<<主体ID>>>。按帮助补齐固定规格及--duration，传--poll 0先提交，再用 `kling query_tasks <实际generationId>` 续查，保存成功作品URL后下载到clipPath。不能用CLI内部接口或宿主MCP代替命令。

request保存实际model、arguments对象、inputs对象、argv和submitResponse；arguments.elements落盘为数组，有主体为 `[{"id":"324475410205532","bindName":"林川","type":"image"}]`，无人为[]。inputs.image_1/video_1记录实际CLI输入（绝对路径或HTTPS），不要求拿到CLI内部自动上传URL。argv为从["kling","omni_ref_video"]开始的实际参数数组，避免shell拼接；submitResponse为CLI原始{ok,status,body}回执，确认ok=true、body.generationId后立即存档（兼容旧generation_id拼写）。校验输入、主体、模型、提示词及回执ID一致，缺失则阻止后期。错误不改通道，超时只查询原ID，不重复扣费提交。

对实际scenePath和clipPath计算sceneSha256、clipSha256；观看后写visualReview={passed:true,notes:具体检查结果}，不得用ffprobe替代视觉验收。主体身份、落点、受光、遮挡、建筑稳定性、动作、内部切镜都须检查。

render只接收外部片段，验证记录和文件后裁切、合成转场、混配乐，不调用旧prepare/render的图片或Turbo生成。resolved-plan.json保留细化和任务记录并增加实际timeline。只改转场/音乐可以prepare并复用已验证视频。reset保留原始片段与任务历史，改用新clipPath，清除发布用结果索引。

## 验证与边界

控制台：`node scripts/test-vlog-omni.cjs`、`node scripts/test-vlog-scenes.cjs`、`node scripts/test-video-timeline.cjs`、`node scripts/test-story-characters.cjs`、`node scripts/test-asset-analysis.cjs`、`npm run build`。

执行器：`uv run --with pytest python -m pytest tests/test_featured_vlog_omni.py tests/test_featured_vlog.py tests/test_video_timeline.py -q`。测试使用本地生成的图形和音调，不消耗Kling额度、不代表真实摄影观感验收。

真实验收需参考资源可用、执行环境更新、CLI账号及额度就绪。用包含环境/人物/细节的一条3–6镜视频检查主题与转场、人物道具、实际无内部切镜、9:16、24fps及单AAC配乐。记录实际费用和返工，不沿用报告中的历史单价。参考视频模式可能影响服务端自动分镜，即使请求prefer_multi_shots=false也必须检查结果。官方命令说明：https://github.com/klingai-tech/skills；安装Skill说明不等于安装CLI，Hermes已安装，本轮无需重装。

参考视频使用已合并的后端管理与模板关联功能；人物仍使用集中配置的林川主体。生成任务公共规则不重复堆入每镜，18000字符作为提示词预算与回归目标，不用截断方式破坏JSON。
