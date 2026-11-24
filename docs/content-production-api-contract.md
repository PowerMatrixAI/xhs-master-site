# 独立精选 Vlog 联调约定

本次实现位于 xhs-master-site 的 hermes 分支。业务后端和 Hermes 调度由其他工程师接入。所有业务接口沿用 /client 前缀、现有签名认证及 {status,data,message,code} 返回结构。账号运营继续使用原接口。

## 作品接口

- GET /production/v1/list?accountId=123 返回 {items: ContentProduction[]}，按 updatedAt 降序。首期返回当前账号全部作品。
- GET /production/v1/detail?accountId=123&id=456 返回完整 ContentProduction。
- POST /production/v1/save 创建或更新作品，返回完整最新记录。

ContentProduction 的字段定义见 src/lib/contentProductions.ts。id 为正整数，revision 为递增整数。创建请求包含 accountId、kind=featured_vlog、requestId 和初始作品字段，同一用户和 requestId 重试返回同一作品。更新请求包含 id、accountId、expectedRevision 与变更字段，原子比较修订号，冲突返回 HTTP 409 和中文说明。每次更新保留上一修订用于任务追溯。未传字段保持已有值。

作品包括 templateId、templateVersion、extraRequirements、script、effectiveScript（适配后实际制作脚本）、confirmed、settings、knowledgeSnapshotId、result、plan。script 为不含 noteTask 的 VlogScript。settings 包含 character、resolution、useReferenceVideo。result 包含 openclawTask、videoPrompt、sceneReferences。作品最初可以没有脚本、指令和计划。原模板及相关业务快照随版本保存，历史执行任务保留实际提交快照。

生成新脚本将 confirmed=false，已有制作指令可作为历史内容展示。确认后可生成新制作计划。跨设备从详情恢复最近保存结果，正在进行的 AI 阶段当前仍依赖浏览器缓存和 Next 单进程任务表。

所有接口验证登录用户的账号权限和作品归属。更新不可迁移账号归属。

## 在线媒体任务

现有 POST /media/v1/generate 新增 source=production、productionId、productionRevision。独立作品不传 noteTaskId。请求另含 accountId、kind=video、mode=featured_vlog、prompt、assetIds、options、requestId。

options 包含人物/分辨率/参考视频设置及 plan。后端须校验作品归属和修订，并固化提交的脚本、指令、计划、配置。不要根据账号最近周计划重建任务。同一 requestId 必须幂等，网络重试不重复扣费。

运营旧请求缺少 source 时按 operation 处理，继续关联 noteTaskId。媒体详情与列表返回 source、productionId、productionRevision；独立作品 noteTaskId 可空。GET /media/v1/tasks 增加可选 source 查询参数，筛选必须影响 total 及分页。

重试使用原提交快照。上传/成片关联作品及媒体任务，不要求存在运营笔记。删除失败媒体任务不得删除作品或其他修订。

## Hermes

独立作品的任务目录为 .tasks/xhs-featured-vlog-production-{id}。仍执行现有 version=3 协议。调度及回传使用媒体任务 ID，作品 ID 用于业务关联，不转换成笔记 ID。一个作品的并发制作任务须使用媒体任务 ID 隔离工作区，同时保留指令目录的映射，避免并发覆盖。付费提交前校验当前 Skill 已支持无 styleVideo 的计划。

## 当前验证边界

控制台 Next 新增 /api/productions/vlog，提供 script、featured_vlog_context、adapt_featured_vlog_character、plan_featured_vlog_frames、select_featured_vlog_music、build_featured_vlog_task 阶段，GET uuid 查询结果。凭据沿用当前用户，不增加业务后端 AI 接口。

服务端作品接口未接入时页面展示请求失败，不创建临时周计划或笔记。离线/模拟测试不能替代作品持久化、权限、队列、上传及真实成片的联调验收。
