> 2026-11-25 联调更新：当前控制台已改用已实现的通用图片协议，作品 `kind=image`，制作 `kind=image, mode=remote_images`。下文 `cover_image` 专用接口描述为早期提案，不是当前服务端必需实现。
>
> 当前映射：`settings.coverDraft` 保存三版编辑数据（input、variants、confirmedVariantIds）；同一 settings 同时保存 imageSourceMode、noteContent、singleGoal、imageCount、realImageRefinementRequirement、selectedAssets 等标准字段。result 保存 openclawTask、imagePrompt、referenceStyle、commands。生成请求携带 productionId、productionRevision、assetIds 和已保存指令。
>
> 成果按通用 artifacts 展示；不假设后端会返回 variantId、items 或 bundleUrl，不调用新任务未支持的逐版 retry 参数。用户仍可选择某一版本单独制作。老 cover_image 任务的逐版展示保留兼容。

# 内容生产封面图接口增量

基于 content-production-api-contract.md，复用账号、作品和媒体任务接口。前端本次实现于 v2.0.0/temp。服务端独立实施，以下为联调约定。

## 作品

作品 kind 保持业务类型语义，视频仍为 featured_vlog，新增 cover_image，不新增作品 mode。

GET /production/v1/list 增加可选 kind 筛选，返回 {items}，按更新时间降序。旧视频记录保持原类型，前端同时过滤响应类型。详情沿用 /production/v1/detail。

POST /production/v1/save 支持封面作品，结构见 src/lib/coverProduction.ts 的 CoverProduction。
- title 固定为用户 input.text，保留完整内容，AI标题不会替换任务名称。
- input 包含一张 asset（id、HTTPS地址、分析和尺寸快照）、text、requiredText、requirements。
- variants 固定三个稳定标识 bold、editorial、poster，分别保存 title、subtitle、design。
- confirmedVariantIds 表示用户已确认的版本；confirmed=true 仅表示三版均确认。
- plan 保存确认后的结构化封面计划。新建作品可有三版方案但未确认。
- 使用已有 requestId 创建幂等、expectedRevision 乐观锁；返回完整最新作品。
- 修改某版只清除该版确认；换图或修改原始需求清除全部确认。历史计划保留为历史，不可直接当作新版本执行。
- latestTaskId 由后端提交媒体任务成功后原子关联，前端不另发保存请求补写。跨设备恢复使用此字段。
- 根据 kind 校验字段，封面无需 templateId、视频 script 或视频 settings。校验登录用户、账号及所选asset归属。

## 在线制作

POST /media/v1/generate 使用 source=production、kind=image、mode=cover_image、productionId、productionRevision。
prompt 为执行说明；assetIds 恰好一项；options 包含 title、plan、variantIds、items。
每个执行项含 variantId、name、imageUrl、editPrompt、textBlocks、size、renderMode。
服务端验证所选variantIds属于作品的已确认版本，并冻结该修订的图、文字和计划。
一键提交三个版本或提交一个修改版本。每个批次独立工作目录，执行项以variantId隔离。相同requestId返回同一任务。
任务名称采用作品原始input.text。一个版本的失败不丢弃其他版本产物。

任务列表和详情新增 mode、items、bundleUrl 可选字段。
items=[{variantId,name,status,error?,artifacts?}]。
artifacts沿用type/name/url/cosPath/sizeBytes，新增variantId，不能仅靠数组顺序关联版本。
批次部分成功用status=partially_completed，所有版本失败用failed；尚有运行版本时保持running。
三版完成后提供HTTPS bundleUrl作为ZIP下载地址，供“下载全部封面”；单版提供原图URL。
GET /media/v1/tasks 支持既有kind/source以及partially_completed状态筛选。

POST /media/v1/retry 增加可选variantId和requestId，指定失败项重试，返回可轮询的完整任务（可同ID或新ID）。
保留同批次其他成功结果。仅上传失败时补传已有文件，不再次生图。结果未确认时续查原任务，不重复扣费。
旧任务未传variantId继续原有行为。

## 在线执行协作

仍调用现有edit-image，每个版本从同一原始素材开始，首次各调用一次；不创建新Skill命令。
实际读图决定文字落点，逐字匹配确认文案，校验主体保真、尺寸及排版。失败版本等待用户重试，不自动重复付费。
已生成文件与任务记录一并保存，上传失败可恢复。控制台不直接持有图片模型密钥。

## 规划

Next新增 /api/productions/cover，调用现有后端AI，POST返回uuid、GET查询三版方案。
此阶段仅产生文案和设计说明，不生成图片、不创建运营笔记、不依赖周计划或爆款文风。
服务端未实现上述作品/批次能力时显示接口错误，不能宣称已完成真实在线生成。
