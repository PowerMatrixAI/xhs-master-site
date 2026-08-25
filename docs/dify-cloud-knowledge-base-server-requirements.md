# Dify Cloud 知识库服务端开发需求

## 1. 服务端职责

`xhs_server` 接入 Dify Cloud，为每个小红书账号管理独立知识库，并在统一 AI 调用前注入服务端保存的知识快照。

- 一个账号一个 Dify Dataset；
- Dify API Key 仅存于 `xhs_server`；
- 客户端可以请求检索，但不获得原始片段，只获得 `snapshotId`；
- 统一 AI 接口接收可选 `knowledgeSnapshotId`，在服务端加载片段后再调用 AI；
- 只有生成一周计划前调用 Dify；后续正文、图片、视频方案读取任务关联快照。

## 2. 配置与 Dify Client

环境变量：

```env
DIFY_API_BASE_URL=https://api.dify.ai/v1
DIFY_API_KEY=<server-side-secret>
```

新增 `DifyKnowledgeClient`，封装以下接口：

| 能力 | Dify API |
| --- | --- |
| 创建 Dataset | `POST /v1/datasets` |
| 上传 Markdown | `POST /v1/datasets/{dataset_id}/document/create-by-file` |
| 查询文档/索引状态 | `GET /v1/datasets/{dataset_id}/documents` 或文档状态接口 |
| 删除文档 | `DELETE /v1/datasets/{dataset_id}/documents/{document_id}` |
| 检索 | `POST /v1/datasets/{dataset_id}/retrieve` |

Client 统一处理请求超时、有限重试、错误分类和日志脱敏。不得记录 API Key、Markdown 全文、快照片段全文或完整 AI Prompt。

## 3. 数据表与字段

### 3.1 `account_knowledge_bases`

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `account_id` | 小红书账号 ID，唯一 |
| `dify_dataset_id` | Dify Dataset UUID，唯一 |
| `status` | `provisioning / active / failed / deleting` |
| `last_error` | 最近错误 |
| `created_at` / `updated_at` | 时间字段 |

### 3.2 `account_knowledge_documents`

| 字段 | 说明 |
| --- | --- |
| `id` | 本地文档 ID |
| `account_id` | 所属账号 ID |
| `dify_document_id` | Dify 文档 UUID |
| `title` / `description` | 显示名称与用户说明 |
| `original_filename` | 原文件名 |
| `content_sha256` / `content_chars` | 去重与大小信息 |
| `status` | `uploading / indexing / ready / failed / deleting` |
| `error_message` | 索引错误 |
| `created_by` | 上传用户 ID |
| `created_at` / `updated_at` | 时间字段 |

### 3.3 `knowledge_retrieval_snapshots`

| 字段 | 说明 |
| --- | --- |
| `id` | `snapshotId` |
| `account_id` | 所属账号 ID |
| `references_json` | 最终保留的 `K1-Kn` 原始片段、文档信息、标题路径、相似度 |
| `status` | `active / consumed / expired / invalid` |
| `created_by` | 发起用户 ID |
| `created_at` / `expires_at` | 临时快照清理时间 |

### 3.4 既有表扩展

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `weekly_plan` | `knowledge_snapshot_id` nullable | 该周计划使用的快照 ID |
| `note_task` | `knowledge_source_keys` JSON nullable | 当前任务关联的 `K` 编号，例如 `["K2", "K5"]` |

快照在周计划成功保存后标记为 `consumed`；未关联到周计划的临时快照可在 24 小时后清理。

## 4. 文档管理接口

每个接口先校验当前用户拥有 `accountId` 权限；客户端不能指定 Dataset ID。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| `POST` | `/client/accounts/{accountId}/knowledge-documents` | 接收 Markdown；不存在 Dataset 时先创建；上传 Dify；保存本地文档记录 |
| `GET` | `/client/accounts/{accountId}/knowledge-documents` | 返回当前账号文档及索引状态 |
| `PUT` | `/client/accounts/{accountId}/knowledge-documents/{id}` | 更新名称/说明；替换时先上传新版本，`ready` 后切换，最后删除旧版本 |
| `DELETE` | `/client/accounts/{accountId}/knowledge-documents/{id}` | 立即从未来检索排除，删除 Dify 文档和本地记录 |

限制：仅 UTF-8 `.md`；建议单文件最大 2 MB、单账号最多 50 份；拒绝空文件、无效编码、重复 `content_sha256`。

## 5. 知识检索接口

```http
POST /client/accounts/{accountId}/knowledge-retrievals
```

请求：

```json
{
  "queries": [
    "主推菜品；食材、风味、口感、分量、制作特点、用餐场景",
    "门店空间、服务、到店场景、真实体验细节"
  ]
}
```

接口校验：`queries` 为非空短语数组；限制单条长度、总长度和数组数量，避免滥用。服务端不自行加入账号画像或完整策划案。

执行：

1. 校验账号权限，获取该账号唯一 `dify_dataset_id`；无 Dataset 或无 ready 文档时返回空快照状态。
2. 每条 query 调用当前 Dataset 的 Dify Retrieval API。
3. 用户有 `weeklyFocus` 时前端只传一条 query，Dify `top_k=8`。
4. 无重点时前端按已选运营目标传多条 `knowledgeRetrievalQuery`，单条 `top_k=3`。
5. 合并结果，按相似度排序，去重并过滤低分。
6. 总片段文本不超过 4,500 中文字符或等价 token；不固定片段数，但设置 12 段异常保护上限。
7. 保存 `K1-Kn` 原始片段至 `knowledge_retrieval_snapshots`，返回 `snapshotId`。

响应禁止返回片段正文：

```json
{
  "snapshotId": "kr_01H...",
  "status": "ready",
  "hasReferences": true
}
```

## 6. 统一 AI 接口扩展

现有统一 AI 调用接口新增可选字段：

```json
{
  "input": "现有 Prompt 内容",
  "knowledgeSnapshotId": "kr_01H..."
}
```

存在 `knowledgeSnapshotId` 时：

1. 校验快照存在、未过期、属于当前用户可访问账号；
2. 从 `references_json` 读取原始片段；
3. 用固定标题和事实约束追加到实际 Prompt；
4. 调用现有 AI；
5. 不把片段正文回传浏览器。

不存在或无效时按现有 AI 流程执行。接口不需要识别“周计划”或“正文”等业务类型，业务差异由传入 Prompt 决定。

追加文本固定包含：只使用明确事实；不暴露资料/检索来源；未确认的价格、活动、库存、营业时间、开放状态、资质、功效等不得写成确定承诺。

## 7. 周计划保存与任务绑定

周计划 Prompt 必须要求每篇任务返回内部字段：

```json
{
  "topicTitle": "安吉战斧牛排实测",
  "knowledgeSourceKeys": ["K2", "K5"]
}
```

保存周计划时：

1. 使用本次 `knowledgeSnapshotId`；
2. 校验每篇任务的 `knowledgeSourceKeys` 只引用该快照中的 `K1-Kn`；
3. 无效编号拒绝保存并要求重新生成或返回错误；
4. 保存 `weekly_plan.knowledge_snapshot_id` 与 `note_task.knowledge_source_keys`；
5. 将快照状态改为 `consumed`。

允许 `knowledgeSourceKeys=[]`，表示该任务没有适用资料。

## 8. 后续生成：不再检索 Dify

三版标题正文、图片方案、视频方案都按 `noteTaskId`：

1. 读取任务所属周计划的 `knowledge_snapshot_id`；
2. 按 `knowledge_source_keys` 获取片段；
3. 在服务端追加至实际 Prompt；
4. 调用现有统一 AI 接口，但不传新的 Dify 检索请求。

上下文限制：

| 流程 | 最大字符数 | 异常保护 |
| --- | ---: | ---: |
| 三版标题正文 | 3,000 | 最多 8 段 |
| 图片方案 | 2,500 | 最多 8 段 |
| 视频方案 | 2,500 | 最多 8 段 |

仅注入完整片段，禁止从片段中间截断。若某任务选择的片段整体超预算，应在周计划生成时减少 `knowledgeSourceKeys`，不能静默丢失部分事实。

## 9. 降级、安全与验收

| 场景 | 处理 |
| --- | --- |
| 无 Dataset、无 ready 文档、无命中 | 空快照或跳过快照，按现有流程生成 |
| Dify 超时或 5xx | 记录 warning，按无知识库流程生成，不阻断用户 |
| 快照失效或跨账号 | 拒绝使用，不尝试其他账号 Dataset |
| 文档删除 | 排除未来检索；已保存周计划的快照默认保留，保证历史任务一致性 |

安全要求：账号权限校验覆盖文档、检索、快照和 AI 调用；Dify API Key、知识全文、快照片段和完整 Prompt 不写入常规日志；知识资料按不可信输入处理。

验收：

1. 各账号 Dataset 完全隔离。
2. 前端检索接口只返回 `snapshotId`，不返回原始片段。
3. 统一 AI 接口能在服务端按 `knowledgeSnapshotId` 追加片段。
4. 周计划保存有效任务关联；后续正文、图片、视频不调用 Dify。
5. Dify 不可用、无资料或无命中时，现有生成流程仍成功。
