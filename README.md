# AI Doctor Backend

## 1. 项目定位

这是一个基于 NestJS 的 AI 医疗问答后端，当前提供以下能力：

- 会话创建与结束
- 历史记录查询与删除
- AI 消息发送与 SSE 流式回答
- 消息反馈提交
- App 配置下发
- 分享图生成占位接口

从代码实现看，这个服务目前更接近“原型 / 联调版后端”，已经具备完整的模块划分和核心链路，但仍保留了若干 mock、占位实现和未接入的生产能力。

---

## 2. 技术栈与运行依赖

### 技术栈

- 框架：NestJS 10
- 语言：TypeScript 5
- ORM：Prisma 5
- 数据库：PostgreSQL
- LLM 编排：LangChain + OpenAI-compatible 接口
- 结构化输出校验：Zod
- 通信方式：
  - REST API
  - SSE 流式接口 `GET /api/message/stream`

### 运行依赖

项目运行依赖以下环境变量：

- `DATABASE_URL`：PostgreSQL 连接串
- `OPENAI_API_KEY`：模型服务 API Key
- `OPENAI_BASE_URL`：OpenAI-compatible 接口地址
- `OPENAI_MODEL`：使用的模型名称

### 常用命令

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm start:dev
```

---

## 3. 应用启动与全局机制

### 启动入口

- 入口文件：`src/main.ts`
- 应用启动后统一挂载全局前缀：`/api`
- 默认监听端口：`3000`

### 模块装配

`src/app.module.ts` 中聚合了以下模块：

- `HealthModule`
- `StorageModule`
- `AppConfigModule`
- `SessionModule`
- `HistoryModule`
- `FeedbackModule`
- `ShareModule`
- `MessageModule`

### 全局响应包装

项目通过 `TransformInterceptor` 对普通接口响应做统一包装，正常返回结构为：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

### 全局异常处理

项目通过 `AllExceptionsFilter` 统一处理异常，错误响应也会保持相同外层结构：

```json
{
  "code": 400,
  "message": "具体错误信息",
  "data": null
}
```

实现特点：

- 会把 Nest 异常对象压平成字符串 `message`
- `code` 当前基本沿用 HTTP 状态码，和业务错误码混用

### SSE 的特殊性

`GET /api/message/stream` 直接操作 `express.Response` 输出事件流，不走普通 JSON 包装链路，因此不会经过统一的 `{ code, message, data }` 包装。

---

## 4. 数据模型设计

数据库模型定义在 `prisma/schema.prisma`，当前只有 3 张核心表。

### 4.1 `sessions`

用途：存储一次对话会话。

关键字段：

- `session_id`：主键，UUID
- `user_id`：所属用户 ID
- `title`：会话标题
- `status`：状态字段
- `started_at`：开始时间
- `ended_at`：结束时间
- `deleted_at`：软删除时间

状态说明：

- `active`：进行中
- `ended`：已结束
- `deleted`：已删除

关系：

- 一个 `Session` 对应多条 `Message`

表映射：

- Prisma 模型名：`Session`
- 数据库表名：`sessions`

### 4.2 `messages`

用途：存储用户消息、AI 消息和卡片消息。

关键字段：

- `message_id`：主键，UUID
- `session_id`：所属会话 ID
- `role`：消息角色
- `type`：消息类型
- `content`：纯文本内容
- `content_rich`：富文本 JSON
- `card`：卡片 JSON
- `attachments`：附件 JSON
- `status`：消息状态
- `feedback_status`：反馈状态
- `client_message_id`：客户端消息 ID，用于幂等
- `created_at` / `updated_at`
- `deleted_at`

枚举含义：

- `role`
  - `user`
  - `assistant`
  - `system`
- `type`
  - `text`
  - `image`
  - `card`
- `status`
  - `sending`
  - `sent`
  - `failed`
  - `deleted`
- `feedback_status`
  - `none`
  - `liked`
  - `disliked`

关系：

- 多条 `Message` 属于一个 `Session`
- 一条 `Message` 可以关联多条 `Feedback`

索引与约束：

- 唯一约束：`@@unique([session_id, client_message_id])`
- 普通索引：`@@index([session_id, created_at])`

幂等设计：

- `POST /api/message/send` 通过 `(session_id, client_message_id)` 唯一约束避免重复创建同一条用户消息
- 如果客户端重试请求，服务端会尝试根据这个组合键找回已创建的 assistant 占位消息

表映射：

- Prisma 模型名：`Message`
- 数据库表名：`messages`

### 4.3 `feedbacks`

用途：记录对 AI 消息的点赞 / 点踩结果。

关键字段：

- `feedback_id`：主键，UUID
- `message_id`：被反馈的消息 ID
- `action`：`like | dislike`
- `tags`：标签 JSON
- `comment`：补充说明
- `created_at`

关系：

- 多条 `Feedback` 属于一条 `Message`

表映射：

- Prisma 模型名：`Feedback`
- 数据库表名：`feedbacks`

---

## 5. 模块划分与职责

### 5.1 `health`

职责：服务健康检查。

- Controller：`HealthController`
- Service：无
- 路由：`GET /api/healthz`

逻辑非常简单，固定返回 `{ ok: true }`。

### 5.2 `app-config`

职责：下发前端运行配置。

- Controller：`AppConfigController`
- Service：`AppConfigService`

当前返回的配置包括：

- 顶部 / 底部免责声明
- 首页工具栏配置
- 文本最大长度、发送频率、图片大小限制

该模块是多个业务模块的共享依赖。

### 5.3 `storage`

职责：封装数据库访问。

- `PrismaService`
  - 负责在模块初始化时连接数据库
  - 负责在模块销毁时断开连接
- Repo 层
  - `SessionRepo`
  - `MessageRepo`
  - `FeedbackRepo`

Repo 层将 Prisma 操作与业务 Service 解耦，是整个后端的数据访问基础层。

### 5.4 `session`

职责：管理会话生命周期。

- Controller：`SessionController`
- Service：`SessionService`
- 依赖：
  - `SessionRepo`
  - `AppConfigService`

提供能力：

- 创建会话
- 结束会话

特点：

- 当前用户 ID 未接入鉴权，直接写死为 `mock_user_001`
- 创建会话时会拼装欢迎消息，但欢迎消息不会落库

### 5.5 `history`

职责：管理历史会话与历史消息查询。

- Controller：`HistoryController`
- Service：`HistoryService`
- 依赖：
  - `SessionRepo`
  - `MessageRepo`
  - `AppConfigService`

提供能力：

- 查询历史会话列表
- 查询会话详情
- 删除单个会话
- 批量删除会话

当前实现更偏基础版：

- 列表接口未真正按 `days` 过滤
- `cursor` 暂未参与分页
- `batch_delete` 的 `mode` 参数未使用

### 5.6 `feedback`

职责：提供反馈标签配置和反馈写入。

- Controller：`FeedbackController`
- Service：`FeedbackService`
- 依赖：
  - `FeedbackRepo`
  - `MessageRepo`

提供能力：

- 获取点踩标签配置
- 提交点赞 / 点踩

处理逻辑：

1. 先更新目标消息的 `feedback_status`
2. 再插入一条 `feedbacks` 记录

### 5.7 `share`

职责：分享图接口占位。

- Controller：`ShareController`
- Service：`ShareService`

当前实现：

- 接收 `session_id` 等参数
- 直接返回 mock 的 `share_id`、`image_url`、`expires_in`
- 不读取会话消息，也不真正生成图片

### 5.8 `message`

职责：后端最核心的问答模块。

- Controller：`MessageController`
- Service：
  - `MessageService`
  - `LangChainService`
- 依赖：
  - `MessageRepo`
  - `SessionRepo`
  - `AppConfigService`
  - OpenAI-compatible 模型接口

提供能力：

- 创建用户消息与 assistant 占位消息
- 生成 SSE 流式回答
- 写回 assistant 正文
- 根据策略补充下载卡、追问卡、咨询总结卡

这是当前代码里最完整、也最复杂的模块。

---

## 6. 核心调用链路

### A. 创建会话：`POST /api/session/create`

调用链：

1. `SessionController.createSession` 接收请求体
2. 当前代码直接把用户 ID 固定为 `mock_user_001`
3. `SessionService.createSession` 调用 `SessionRepo.createSession`
4. `SessionRepo` 向 `sessions` 表插入新记录
5. `SessionService` 调用 `AppConfigService.getConfig`
6. 基于配置拼装欢迎消息和免责声明
7. 返回 `session + welcome_messages + disclaimer`

注意：

- `welcome_messages` 是接口层拼装结果，不写入 `messages` 表
- `entry_source` 入参已接收，但未参与业务逻辑

### B. 发送消息：`POST /api/message/send`

调用链：

1. `MessageController.sendMessage` 接收 `session_id`、`client_message_id`、`content`、`attachments`
2. `MessageService.sendMessage` 校验：
   - 内容不能为空
   - 内容长度不能超过 `AppConfigService.limits.text_max_len`
3. 通过 `SessionRepo.getSession` 检查会话是否存在且未删除
4. 调用 `MessageRepo.createMessagePair` 开启事务，同时创建：
   - 一条用户文本消息，状态 `sent`
   - 一条 assistant 占位消息，状态 `sending`
5. 通过 `MessageRepo.countUserMessages` 判断是否是首条用户消息
6. 如果是首条消息，则通过 `SessionRepo.updateSessionTitle` 把会话标题更新为用户内容前 10 个字符
7. 如果事务因唯一约束失败：
   - 说明 `(session_id, client_message_id)` 冲突
   - 进入幂等恢复逻辑
   - 通过 `findAssistantMessageByClientMessageId` 找回已存在的 assistant 消息
8. 返回 SSE 地址：
   - `assistant_message_id`
   - `stream.protocol = sse`
   - `stream.stream_url = /api/message/stream?...`

注意：

- 返回中的 `user_message_id` 目前是占位字符串，不是真实消息 ID
- `token` 当前为固定的 `dev_token_123`

### C. 流式回答：`GET /api/message/stream`

调用链：

1. `MessageController.streamMessage` 接收 `session_id`、`message_id`、`token`
2. `MessageService.streamMessage` 调用 `MessageRepo.getAssistantSendingMessage`
3. 校验该 assistant 消息存在且状态为 `sending`
4. 调用 `MessageRepo.getUserTextByAssistantId` 反查本轮用户问题
5. 设置 SSE 响应头：
   - `Content-Type: text/event-stream; charset=utf-8`
   - `Cache-Control: no-cache, no-transform`
   - `Connection: keep-alive`
6. 建立 `AbortController`，客户端断开时终止模型流
7. 调用 `MessageRepo.listRecent` 读取最近 12 条文本消息，作为上下文
8. 调用 `LangChainService.runPolicySafe` 执行策略判断，得到：
   - 是否需要追问卡
   - 是否插入下载卡
   - 是否需要结束问诊
9. 调用 `LangChainService.streamResponse` 获取模型流式回答
10. 遍历模型返回 chunk，抽取文本并持续输出：

```text
event: delta
data: {"message_id":"...","text":"..."}
```

11. 模型流结束后，调用 `MessageRepo.finishAssistantText` 把完整回答写回数据库，并将消息状态改为 `sent`
12. 根据策略决定是否追加卡片消息：
   - 下载卡：`download_app`
   - 追问卡：`intake_form`
   - 总结卡：`consult_summary`
13. 输出结束事件：

```text
event: done
data: {"final":{...},"cards":[...]}
```

14. 如果中途失败：
   - 调用 `MessageRepo.markFailed` 把 assistant 消息标记为 `failed`
   - 输出错误事件：

```text
event: error
data: {"code":50001,"message":"AI Service Error"}
```

补充说明：

- 如果检测到用户有结束意图，会覆盖策略结果，避免继续出追问卡
- 卡片消息也是写入 `messages` 表的，`type = card`

### D. 历史与反馈

#### 历史详情：`GET /api/history/detail`

调用链：

1. `HistoryController.getSessionDetail` 接收 `session_id`
2. `HistoryService.getSessionDetail` 先用 `SessionRepo.getSession` 查询会话
3. 如果会话不存在或已删除，抛出 `NotFoundException`
4. 调用 `MessageRepo.listBySessionId` 读取该会话下所有未删除消息
5. 调用 `AppConfigService.getConfig` 读取免责声明
6. 返回：
   - `session`
   - `messages`
   - `disclaimer`

#### 反馈提交：`POST /api/feedback/submit`

调用链：

1. `FeedbackController.submitFeedback` 接收 `message_id`、`action`、`tags`、`comment`
2. `FeedbackService.submitFeedback` 先调用 `FeedbackRepo.updateMessageFeedbackStatus`
3. 如果更新失败，则视为消息不存在，抛出 `NotFoundException`
4. 然后调用 `FeedbackRepo.saveFeedback` 插入反馈记录
5. 返回 `{ ok: true }`

---

## 7. AI 编排逻辑

AI 相关逻辑集中在 `src/modules/message/langchain.service.ts`。

### 7.1 `runPolicySafe`

作用：先做一次非流式策略判断。

输入：

- 用户当前问题
- 最近对话上下文

输出重点：

- `need_intake_form`
- `next_question`
- `intake_form`
- `should_promote_download`
- `closing_intent`
- `closing_reason`

用途：

- 决定是否追问
- 决定是否插入下载卡
- 决定是否生成咨询总结卡

### 7.2 `streamResponse`

作用：生成主回答正文。

特点：

- 使用流式模型输出
- 要求输出 Markdown 纯文本
- 包含医疗合规约束
- 遇到危险症状时应明确建议就医

`MessageService` 会把模型 chunk 通过 SSE 实时转发给客户端。

### 7.3 `runDownloadCopySafe`

作用：根据用户问题和本轮回答，生成 `download_app` 卡片文案。

用途：

- 在复杂问题或多轮对话后，引导用户下载 App 获取更完整服务

失败处理：

- 如果结构化解析失败，直接返回 `null`

### 7.4 `runSummarySafe`

作用：在问诊结束时生成 `consult_summary` 总结卡。

输入：

- 用户问题
- 本轮回答内容
- 免责声明文本

用途：

- 汇总本轮要点
- 输出病情摘要、建议列表和底部免责声明

### 7.5 结构化输出 Schema

为了约束模型输出，代码中定义了以下 Zod Schema：

- `IntakeFormSchema`
  - 约束追问卡结构
- `PolicySchema`
  - 约束策略判断结果
- `DownloadAppSchema`
  - 约束下载卡结构
- `ConsultSummarySchema`
  - 约束咨询总结卡结构

### 7.6 模型配置方式

`LangChainService` 在构造阶段通过 `ConfigService` 读取：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

当前实现中：

- 主回答模型 `chatModel`
  - `temperature = 0.7`
  - `streaming = true`
- 策略模型 `policyModel`
  - `temperature = 0`

两者使用同一套 OpenAI-compatible 配置，只是在温度和用途上区分。

---

## 8. API 总览

### 8.1 `GET /api/healthz`

| 项目 | 说明 |
| --- | --- |
| 功能 | 健康检查 |
| 请求参数 | 无 |
| 返回结构 | 普通 JSON 包装 |
| 特殊说明 | `data` 固定为 `{ ok: true }` |

### 8.2 `GET /api/app/config`

| 项目 | 说明 |
| --- | --- |
| 功能 | 获取前端配置 |
| 请求参数 | 无 |
| 返回结构 | `disclaimer`、`tools`、`limits` |
| 特殊说明 | 内容来自 `AppConfigService`，当前为硬编码配置 |

### 8.3 `POST /api/session/create`

| 项目 | 说明 |
| --- | --- |
| 功能 | 创建新会话 |
| 请求参数 | `title?`、`entry_source?` |
| 返回结构 | `session`、`welcome_messages`、`disclaimer` |
| 特殊说明 | 用户 ID 当前固定为 `mock_user_001` |

### 8.4 `POST /api/session/end`

| 项目 | 说明 |
| --- | --- |
| 功能 | 结束会话 |
| 请求参数 | `session_id` |
| 返回结构 | `{ ok: true }` |
| 特殊说明 | 仅更新 `sessions.status = ended` |

### 8.5 `GET /api/history/list`

| 项目 | 说明 |
| --- | --- |
| 功能 | 获取历史会话列表 |
| 请求参数 | `days?`、`limit?`、`cursor?` |
| 返回结构 | `sessions`、`has_more` |
| 特殊说明 | 当前未真正按 `days` 或 `cursor` 生效 |

### 8.6 `GET /api/history/detail`

| 项目 | 说明 |
| --- | --- |
| 功能 | 获取单个会话详情 |
| 请求参数 | `session_id` |
| 返回结构 | `session`、`messages`、`disclaimer` |
| 特殊说明 | 直接返回数据库中的消息数组，不补欢迎消息 |

### 8.7 `POST /api/history/delete`

| 项目 | 说明 |
| --- | --- |
| 功能 | 删除单个会话 |
| 请求参数 | `session_id` |
| 返回结构 | `{ ok: true }` |
| 特殊说明 | 实际为软删除 |

### 8.8 `POST /api/history/batch_delete`

| 项目 | 说明 |
| --- | --- |
| 功能 | 批量删除会话 |
| 请求参数 | `session_ids`、`mode` |
| 返回结构 | `deleted`、`failed` |
| 特殊说明 | `mode` 未使用；空数组时直接返回空结果 |

### 8.9 `GET /api/feedback/config`

| 项目 | 说明 |
| --- | --- |
| 功能 | 获取反馈标签配置 |
| 请求参数 | 无 |
| 返回结构 | `dislike_tags` |
| 特殊说明 | 当前只提供点踩标签 |

### 8.10 `POST /api/feedback/submit`

| 项目 | 说明 |
| --- | --- |
| 功能 | 提交消息反馈 |
| 请求参数 | `message_id`、`action`、`tags`、`comment?` |
| 返回结构 | `{ ok: true }` |
| 特殊说明 | 会同步更新 `messages.feedback_status` |

### 8.11 `POST /api/share/render_image`

| 项目 | 说明 |
| --- | --- |
| 功能 | 生成分享图 |
| 请求参数 | `session_id`、`message_ids?`、`style?`、`include_qr?` |
| 返回结构 | `share_id`、`image_url`、`expires_in` |
| 特殊说明 | 当前为 mock 返回，不真正生成图片 |

### 8.12 `POST /api/message/send`

| 项目 | 说明 |
| --- | --- |
| 功能 | 发送用户消息并创建 assistant 占位消息 |
| 请求参数 | `session_id`、`client_message_id`、`content`、`type?`、`attachments?` |
| 返回结构 | `assistant_message_id`、`stream` |
| 特殊说明 | 使用 `client_message_id` 做幂等 |

### 8.13 `GET /api/message/stream`

| 项目 | 说明 |
| --- | --- |
| 功能 | 获取 AI 流式回答 |
| 请求参数 | `session_id`、`message_id`、`token` |
| 返回结构 | SSE 事件流 |
| 特殊说明 | 不走全局 JSON 包装；`token` 当前未校验 |

---

## 9. 重点 API 细讲

### 9.1 `POST /api/message/send`

#### 幂等策略

- 客户端传入 `client_message_id`
- 数据库对 `(session_id, client_message_id)` 做唯一约束
- 如果客户端因网络抖动重复提交，后端会尝试找回同一轮会话对应的 assistant 占位消息

#### assistant 占位消息机制

在真正发起模型调用前，后端先创建一条：

- `role = assistant`
- `type = text`
- `status = sending`

这样前端可以先拿到 `assistant_message_id`，再基于它去订阅 SSE 流。

### 9.2 `GET /api/message/stream`

#### SSE 事件格式

流式回答分为三类事件：

1. `delta`

```text
event: delta
data: {"message_id":"...","text":"本次新增文本"}
```

2. `done`

```text
event: done
data: {"final":{...},"cards":[...]}
```

3. `error`

```text
event: error
data: {"code":50001,"message":"AI Service Error"}
```

#### 数据库存储结果

流式回答完成后会产生两类结果：

- assistant 正文消息会被更新为完整文本
- 追问卡、下载卡、总结卡会以 `type = card` 的新消息形式插入

### 9.3 `GET /api/history/detail`

实际返回的 `messages` 来自数据库 `messages` 表，不做二次组装，因此可能包含：

- `type = text` 的普通文本消息
- `type = card` 的卡片消息

当前不会自动补入 `session/create` 时返回的欢迎消息。

### 9.4 `POST /api/feedback/submit`

反馈提交不是只写一张表，而是分两步：

1. 更新 `messages.feedback_status`
2. 插入 `feedbacks` 明细

这样前端既可以快速读取消息当前反馈状态，也能保留完整反馈记录。

---

## 10. 现状限制与风险点

以下问题都来自当前真实代码实现，接手时需要优先识别：

- 鉴权未接入，`session` 和 `history` 模块内用户 ID 直接写死为 `mock_user_001`
- `GET /api/message/stream` 的 `token` 只是占位参数，没有任何校验逻辑
- `POST /api/share/render_image` 返回 mock 数据，不读取会话内容，也不真正生成图片
- `GET /api/history/list` 的 `days`、`cursor` 参数目前未真正参与筛选和分页
- `POST /api/history/batch_delete` 中的 `mode` 参数未使用
- `POST /api/session/create` 返回的欢迎消息未持久化到数据库
- `MessageRepo.getAssistantSendingMessage` 使用 `findUnique` 并附带多个非唯一条件，和 Prisma 唯一键语义不完全匹配，存在实现风险
- `MessageRepo.finishAssistantText` 虽然接收 `disclaimerBottom`，但数据库模型没有对应字段，当前不会落库
- `POST /api/message/send` 返回中的 `user_message_id` 仍是占位值
- 业务错误码、HTTP 状态码和异常 filter 中的 `code` 设计混用，不完全统一
- 项目根目录存在 `.env` 文件，且包含真实敏感配置，仓库管理存在泄露风险

---

## 11. 接手建议

如果要把当前后端继续推进到可长期维护的状态，建议优先按以下顺序处理：

1. 先补鉴权和用户态，移除 `mock_user_001`
2. 再补 `message/stream` 的 token 校验和访问安全性
3. 再完善历史分页、过滤和分享图真实生成能力
4. 最后补测试、错误码治理和生产级稳定性建设

---

## 附：对外契约摘要

### REST 统一返回结构

除 SSE 接口外，普通接口都遵循：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

### SSE 事件结构

- `event: delta`
- `event: done`
- `event: error`

### 核心实体

- `Session`
- `Message`
- `Feedback`

### 当前使用的 AI 卡片类型

- `intake_form`
- `download_app`
- `consult_summary`
