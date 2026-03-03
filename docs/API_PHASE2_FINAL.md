# AI 医生二期最终版 API 协议文档

- 文档版本：V2.0 Final
- 适用范围：`apps/frontend` 与 `apps/backend` 二期联调
- 编写依据：
  - `/Users/mjm/Documents/FrontEnd/Project/小荷AI医生/ai-doctor/docs/PRD-v2.md`
  - `/Users/mjm/Documents/FrontEnd/Project/小荷AI医生/ai-doctor/apps/frontend/docs/PHASE2_FRONTEND_TECH_DETAIL.md`
  - `/Users/mjm/Documents/FrontEnd/Project/小荷AI医生/ai-doctor/apps/backend/docs/backendTech-v2.md`

---

## 1. 通用约定

## 1.1 Base URL

- 开发环境：`/api`

## 1.2 统一响应格式

除 SSE 外，所有 HTTP 接口统一返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

说明：

- `code = 0` 表示成功
- 非 `0` 表示业务失败
- HTTP 状态码可结合 4xx/5xx 使用，但前端以 `code` 为主判断业务结果

## 1.3 时间格式

- 所有时间字段统一使用 ISO 8601 字符串
- 示例：`2026-03-02T10:00:00.000Z`

## 1.4 鉴权约定

当前代码仍是 mock user，本文档不展开鉴权协议。后续接入登录态时，不改业务字段，仅补充鉴权头。

---

## 2. 枚举定义

## 2.1 SessionStatus

```ts
type SessionStatus = "active" | "ended" | "deleted";
```

## 2.2 MessageRole

```ts
type MessageRole = "user" | "assistant" | "system";
```

## 2.3 MessageType

```ts
type MessageType = "text" | "image" | "card" | "status";
```

说明：

- `status` 仅用于前端本地消息和 SSE 状态展示，默认不落库

## 2.4 MessageStatus

```ts
type MessageStatus =
  | "sending"
  | "sent"
  | "failed"
  | "deleted"
  | "interrupted";
```

## 2.5 TaskType

```ts
type TaskType =
  | "chat"
  | "report_interpret"
  | "body_part"
  | "ingredient"
  | "drug";
```

说明：

- `doctor_reco` 不是独立 `TaskType`
- “就医推荐”快捷入口直接发送普通文本 `帮我找医生`，走 `chat`

## 2.6 EntrySource

```ts
type EntrySource =
  | "direct"
  | "tool_report"
  | "tool_doctor_reco"
  | "tool_body_part"
  | "tool_ingredient"
  | "tool_drug"
  | "history_continue";
```

## 2.7 ToolKey

```ts
type ToolKey =
  | "report_interpret"
  | "open_app"
  | "body_part"
  | "ingredient"
  | "drug"
  | "doctor_reco"
  | "history";
```

---

## 3. 核心数据结构

## 3.1 Session

```json
{
  "session_id": "sess_xxx",
  "user_id": "u_xxx",
  "title": "失眠怎么办",
  "status": "active",
  "entry_source": "direct",
  "started_at": "2026-03-02T10:00:00.000Z",
  "ended_at": null
}
```

## 3.2 Attachment

```json
{
  "attachment_id": "file_001",
  "type": "image",
  "url": "https://cdn.example.com/a.jpg",
  "meta": {
    "width": 1080,
    "height": 1440,
    "size": 123456
  }
}
```

字段说明：

- `attachment_id` 与前端 `file_id` 统一视作同一概念
- 二期接口返回字段名统一使用 `file_id`
- 消息对象内统一使用 `attachment_id`

## 3.3 TaskContext

```json
{
  "task_type": "report_interpret",
  "entry": "quick_tool",
  "images": [
    {
      "file_id": "file_001",
      "url": "https://cdn.example.com/a.jpg"
    }
  ],
  "extra": {}
}
```

类型定义：

```ts
type TaskContext = {
  task_type: TaskType;
  entry: "quick_tool" | "composer" | "history_retry";
  images?: Array<{
    file_id: string;
    url: string;
  }>;
  extra?: Record<string, unknown>;
};
```

## 3.4 Message

```json
{
  "message_id": "msg_xxx",
  "session_id": "sess_xxx",
  "role": "assistant",
  "type": "text",
  "content": "这是回复内容",
  "content_rich": null,
  "attachments": [],
  "created_at": "2026-03-02T10:00:10.000Z",
  "status": "sent",
  "feedback_status": "none",
  "task_type": "chat",
  "thinking_status": "done",
  "fold_meta": {
    "enabled": false,
    "collapsed": false
  },
  "action_meta": {
    "can_copy": true,
    "can_like": true,
    "can_dislike": true,
    "can_share": true
  },
  "card": null,
  "disclaimer_bottom": "回答不构成诊断依据，如有不适请尽快就医"
}
```

补充类型：

```ts
type ThinkingStatus = "thinking" | "done" | "none";
```

## 3.5 Card 联合类型

```ts
type MessageCard =
  | IntakeFormCard
  | DownloadAppCard
  | ConsultSummaryCard
  | OpenAppUpsellCard;
```

### 3.5.1 IntakeFormCard

```json
{
  "card_type": "intake_form",
  "title": "请选择症状持续时间",
  "options": [
    { "key": "1d", "label": "1天内" },
    { "key": "3d", "label": "3天内" }
  ],
  "allow_multi": false,
  "free_text": {
    "enabled": true,
    "placeholder": "补充其他信息（选填）",
    "max_len": 200
  },
  "submit": {
    "action": "send_message",
    "button_text": "发送"
  }
}
```

### 3.5.2 DownloadAppCard

```json
{
  "card_type": "download_app",
  "title": "下载小荷AI医生App，以后可继续咨询",
  "sub_title": "下载APP 选择历史对话接着聊",
  "image_url": "https://cdn.example.com/download.png",
  "cta": {
    "text": "立即下载",
    "action": "download"
  }
}
```

### 3.5.3 ConsultSummaryCard

```json
{
  "card_type": "consult_summary",
  "title": "本次咨询总结",
  "summary": "这是总结内容",
  "patient_info": {
    "title": "关键信息",
    "items": [
      { "label": "症状", "value": "失眠" }
    ]
  },
  "advice_list": [
    {
      "title": "建议观察",
      "content": "若持续加重请线下就医"
    }
  ],
  "footer": {
    "disclaimer": "回答不构成诊断依据，如有不适请尽快就医"
  }
}
```

### 3.5.4 OpenAppUpsellCard

```json
{
  "card_type": "open_app_upsell",
  "title": "打开 APP 上传更多资料",
  "sub_title": "补充病历、报告、处方后可获得更完整分析",
  "tabs": [
    {
      "key": "record",
      "label": "病历",
      "examples": ["门诊病历", "住院记录"]
    },
    {
      "key": "report",
      "label": "报告",
      "examples": ["血常规", "影像报告"]
    },
    {
      "key": "prescription",
      "label": "处方",
      "examples": ["处方单", "药盒信息"]
    }
  ],
  "cta": {
    "text": "打开APP 上传更多资料",
    "action": "open_app"
  }
}
```

---

## 4. 错误码

| 业务码 | 含义 |
| --- | --- |
| `40001` | 文本为空且无附件 |
| `40002` | 文本超长 |
| `40003` | 图片格式非法 |
| `40004` | 图片数量超限 |
| `40005` | 附件未就绪 |
| `40401` | 会话不存在 |
| `40402` | 消息不存在 |
| `40403` | 附件不存在 |
| `40901` | 幂等冲突 |
| `40902` | 会话已有运行中任务 |
| `42901` | 发送过于频繁 |
| `50001` | LLM 服务异常 |
| `50002` | 任务超时 |
| `50003` | 视觉分析失败 |
| `50004` | SSE 中断异常 |

---

## 5. 配置接口

### 5.1 获取 App 配置

**GET** `/api/app/config`

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "disclaimer": {
      "top_bar": "AI回答仅供参考，请勿用于医疗诊断或就医决策",
      "bottom_hint": "回答不构成诊断依据，如有不适请尽快就医"
    },
    "tools": [
      {
        "key": "report_interpret",
        "title": "报告解读",
        "icon": "report",
        "trigger_mode": "pick_image"
      },
      {
        "key": "doctor_reco",
        "title": "就医推荐",
        "icon": "pre_comment",
        "trigger_mode": "send_message",
        "preset_text": "帮我找医生"
      },
      {
        "key": "body_part",
        "title": "拍患处",
        "icon": "camera",
        "trigger_mode": "pick_image"
      },
      {
        "key": "ingredient",
        "title": "拍成分",
        "icon": "ingredients",
        "trigger_mode": "pick_image"
      },
      {
        "key": "drug",
        "title": "拍药品",
        "icon": "medicine",
        "trigger_mode": "pick_image"
      },
      {
        "key": "open_app",
        "title": "打开APP",
        "icon": "download1",
        "trigger_mode": "deeplink"
      },
      {
        "key": "history",
        "title": "咨询记录",
        "icon": "cc-history",
        "trigger_mode": "route"
      }
    ],
    "limits": {
      "text_max_len": 500,
      "send_rate_limit_ms": 3000,
      "image_max_mb": 10,
      "upload_timeout_s": 30,
      "image_max_count": 9
    },
    "app_link": {
      "scheme_url": "xiaohe://upload?from=h5_ai_doctor",
      "download_url": "https://example.com/download",
      "app_store_url": "https://apps.apple.com/...",
      "yingyongbao_url": "https://sj.qq.com/..."
    }
  }
}
```

---

## 6. 会话接口

### 6.1 创建会话

**POST** `/api/session/create`

**Request**

```json
{
  "title": "",
  "entry_source": "direct"
}
```

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "session": {
      "session_id": "sess_123",
      "status": "active",
      "title": "New Chat",
      "entry_source": "direct",
      "started_at": "2026-03-02T10:00:00.000Z"
    },
    "welcome_messages": [
      {
        "message_id": "msg_welcome",
        "session_id": "sess_123",
        "role": "assistant",
        "type": "text",
        "content": "你好，我是小荷健康推出的 AI 健康咨询助手，可以为你提供全天 24 小时的健康帮助，快来和我对话吧！",
        "created_at": "2026-03-02T10:00:00.000Z",
        "status": "sent",
        "feedback_status": "none",
        "task_type": "chat",
        "thinking_status": "none",
        "content_rich": {
          "blocks": [
            {
              "type": "paragraph",
              "text": "你好，我是小荷健康推出的 AI 健康咨询助手，可以为你提供全天 24 小时的健康帮助，快来和我对话吧！"
            }
          ]
        },
        "attachments": [],
        "card": null,
        "disclaimer_bottom": "回答不构成诊断依据，如有不适请尽快就医"
      }
    ],
    "disclaimer": {
      "top_bar": "AI回答仅供参考，请勿用于医疗诊断或就医决策",
      "bottom_hint": "回答不构成诊断依据，如有不适请尽快就医"
    }
  }
}
```

### 6.2 结束会话

**POST** `/api/session/end`

**Request**

```json
{
  "session_id": "sess_123"
}
```

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "ok": true
  }
}
```

---

## 7. 上传接口

### 7.1 上传图片

**POST** `/api/upload/image`

`Content-Type: multipart/form-data`

表单字段：

- `file`: 图片文件
- `biz`: `report_interpret | body_part | ingredient | drug`

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "file_id": "file_001",
    "url": "https://cdn.example.com/a.jpg",
    "width": 1080,
    "height": 1440,
    "size": 123456
  }
}
```

失败场景：

- 文件类型不支持：`40003`
- 文件大小超限：`40003`
- 上传超时：`50002`

---

## 8. 消息接口

### 8.1 发送消息

**POST** `/api/message/send`

说明：

- 二期统一使用 `task_context + attachment_ids`
- 纯文本任务不传 `attachment_ids`
- 图片任务必须传 `task_context.task_type`
- 就医推荐快捷入口直接发送普通文本消息，不单独传任务类型
- 后端统一调用一个支持多模态输入的大模型：无图时只传文本，有图时传文本 + 图片

#### 8.1.1 普通文本问答 Request

```json
{
  "session_id": "sess_123",
  "client_message_id": "cmsg_001",
  "content": "我最近经常失眠怎么办？"
}
```

#### 8.1.2 就医推荐入口 Request

```json
{
  "session_id": "sess_123",
  "client_message_id": "cmsg_002",
  "content": "帮我找医生"
}
```

#### 8.1.3 图片任务 Request

```json
{
  "session_id": "sess_123",
  "client_message_id": "cmsg_003",
  "content": "请帮我解读这份报告",
  "task_context": {
    "task_type": "report_interpret",
    "entry": "quick_tool",
    "images": [
      {
        "file_id": "file_001",
        "url": "https://cdn.example.com/a.jpg"
      }
    ]
  },
  "attachment_ids": ["file_001"]
}
```

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "assistant_message_id": "msg_assistant_001",
    "stream": {
      "protocol": "sse",
      "stream_url": "/api/message/stream?session_id=sess_123&message_id=msg_assistant_001&token=dev_token_123"
    }
  }
}
```

约束：

- `content` 和 `attachment_ids` 不能同时为空
- 当 `attachment_ids` 非空时，所有附件必须属于当前用户且状态为 ready
- `client_message_id` 用于幂等

### 8.2 停止消息生成

**POST** `/api/message/stop`

**Request**

```json
{
  "session_id": "sess_123",
  "assistant_message_id": "msg_assistant_001"
}
```

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "ok": true
  }
}
```

停止成功后，前端应期待后续 SSE 出现中断态状态消息，或在本地将该消息更新为 `status = interrupted`。

### 8.3 消息流式输出

**GET** `/api/message/stream`

Query 参数：

- `session_id`
- `message_id`
- `token`

协议：`text/event-stream`

支持事件：

- `status`
- `delta`
- `done`
- `error`

#### 8.3.1 `status`

用途：

- 展示“正在分析 X 张图片”
- 展示“深度思考中”
- 展示“已完成思考”
- 展示“已停止生成”

示例：

```text
event: status
data: {"message_id":"msg_assistant_001","task_id":"task_001","step":"multimodal_generating","text":"正在分析1张图片"}
```

前端处理：

- 生成一条 `assistant + type=status` 的本地消息
- 默认不要求后端持久化该消息

#### 8.3.2 `delta`

用途：

- assistant 正文增量输出

示例：

```text
event: delta
data: {"message_id":"msg_assistant_001","text":"这是增量文本"}
```

#### 8.3.3 `done`

用途：

- 返回最终 assistant message 与卡片

示例：

```text
event: done
data: {"final":{"message_id":"msg_assistant_001","session_id":"sess_123","role":"assistant","type":"text","content":"最终完整文本","content_rich":null,"attachments":[],"created_at":"2026-03-02T10:00:20.000Z","status":"sent","feedback_status":"none","task_type":"report_interpret","thinking_status":"done","fold_meta":{"enabled":false,"collapsed":false},"action_meta":{"can_copy":true,"can_like":true,"can_dislike":true,"can_share":true},"card":null,"disclaimer_bottom":"回答不构成诊断依据，如有不适请尽快就医"},"cards":[{"message_id":"msg_card_001","role":"assistant","type":"card","status":"sent","card":{"card_type":"open_app_upsell","title":"打开 APP 上传更多资料","cta":{"text":"打开APP 上传更多资料","action":"open_app"},"tabs":[]}}],"task":{"task_id":"task_001","status":"completed"}}
```

#### 8.3.4 `error`

用途：

- 流式过程失败收口

示例：

```text
event: error
data: {"code":50002,"message":"multimodal timeout","task_id":"task_001"}
```

前端处理：

- 若已存在 assistant 消息，更新其 `status=failed`
- 若本次是主动中断，可更新为 `status=interrupted`

---

## 9. 历史接口

### 9.1 获取会话列表

**GET** `/api/history/list`

Query 参数：

- `days`
- `limit`
- `cursor`

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "sessions": [
      {
        "session_id": "sess_123",
        "title": "失眠怎么办",
        "started_at": "2026-03-02T10:00:00.000Z",
        "status": "active"
      }
    ],
    "has_more": false
  }
}
```

### 9.2 获取会话详情

**GET** `/api/history/detail?session_id=sess_123`

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "session": {
      "session_id": "sess_123",
      "title": "失眠怎么办",
      "status": "active",
      "started_at": "2026-03-02T10:00:00.000Z"
    },
    "messages": [
      {
        "message_id": "msg_user_001",
        "session_id": "sess_123",
        "role": "user",
        "type": "text",
        "content": "帮我找医生",
        "attachments": [],
        "created_at": "2026-03-02T10:00:05.000Z",
        "status": "sent",
        "task_type": "chat"
      },
      {
        "message_id": "msg_assistant_001",
        "session_id": "sess_123",
        "role": "assistant",
        "type": "text",
        "content": "建议先看神经内科或睡眠门诊。",
        "attachments": [],
        "created_at": "2026-03-02T10:00:10.000Z",
        "status": "sent",
        "feedback_status": "none",
        "task_type": "chat",
        "thinking_status": "done"
      },
      {
        "message_id": "msg_card_001",
        "session_id": "sess_123",
        "role": "assistant",
        "type": "card",
        "content": "",
        "attachments": [],
        "created_at": "2026-03-02T10:00:12.000Z",
        "status": "sent",
        "card": {
          "card_type": "intake_form",
          "title": "请选择症状持续时间",
          "options": [
            { "key": "1d", "label": "1天内" }
          ],
          "allow_multi": false,
          "free_text": {
            "enabled": true
          },
          "submit": {
            "action": "send_message",
            "button_text": "发送"
          }
        }
      }
    ],
    "disclaimer": {
      "top_bar": "AI回答仅供参考，请勿用于医疗诊断或就医决策",
      "bottom_hint": "回答不构成诊断依据，如有不适请尽快就医"
    }
  }
}
```

### 9.3 删除会话

**POST** `/api/history/delete`

**Request**

```json
{
  "session_id": "sess_123"
}
```

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "ok": true
  }
}
```

### 9.4 批量删除会话

**POST** `/api/history/batch_delete`

**Request**

```json
{
  "session_ids": ["sess_123", "sess_456"],
  "mode": "batch"
}
```

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "deleted": ["sess_123", "sess_456"],
    "failed": []
  }
}
```

---

## 10. 反馈接口

### 10.1 获取反馈配置

**GET** `/api/feedback/config`

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "dislike_tags": [
      "未解决",
      "理解力差",
      "模糊难懂",
      "片面/错误",
      "询问太多",
      "操作困难",
      "生硬机械",
      "功能欠缺"
    ]
  }
}
```

### 10.2 提交反馈

**POST** `/api/feedback/submit`

**Request**

```json
{
  "message_id": "msg_assistant_001",
  "action": "dislike",
  "tags": ["未解决", "模糊难懂"],
  "comment": "没有说清楚"
}
```

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "ok": true
  }
}
```

---

## 11. 分享接口

### 11.1 生成分享图

**POST** `/api/share/render_image`

**Request**

```json
{
  "session_id": "sess_123"
}
```

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "share_id": "share_123",
    "image_url": "https://placehold.co/600x1200/png?text=Share+Image",
    "expires_in": 86400
  }
}
```

---

## 12. 可选容灾接口

### 12.1 查询任务状态

**GET** `/api/task/status?session_id=sess_123&assistant_message_id=msg_assistant_001`

用途：

- SSE 意外断开时，前端补查任务状态

**Response**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_001",
    "status": "running",
    "step": "multimodal_generating"
  }
}
```

---

## 13. 联调规则

1. `doctor_reco` 只是一种工具入口 key，不是独立接口，也不是独立任务类型。
2. 图片任务必须先上传，再发 `message/send`。
3. 后端统一调用一个支持多模态输入的大模型，区别只在于是否传图片，不在于切换不同 answer 模型。
4. `task_type` 仅用于区分 prompt 和回答策略，不用于决定模型类型。
5. `status` SSE 事件默认前端本地落消息，不要求服务端写库。
6. `done` 返回的 `cards` 必须已经是可直接渲染的最终结构。
7. 主动中断后，前端与后端都应将消息状态视为 `interrupted`。
8. 历史详情返回的 `messages` 必须足够前端完整重建聊天流。
