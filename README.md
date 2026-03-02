# AI Doctor Backend

NestJS backend for AI Doctor application.

## Setup

1. Install dependencies:

   ```bash
   cd apps/backend
   pnpm install
   ```

2. Configure Database:
   Create a `.env` file in `apps/backend` (or ensure `DATABASE_URL` is set):

   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/ai_doctor?schema=public"
   OPENAI_API_KEY="sk-..."
   OPENAI_BASE_URL="https://api.siliconflow.com/v1"
   OPENAI_MODEL="deepseek-ai/DeepSeek-V3"
   ```

3. Initialize Prisma Client & Database:
   ```bash
   pnpm prisma:generate
   pnpm prisma:migrate
   ```

## Running the app

```bash
# development
pnpm start

# watch mode
pnpm start:dev

# production mode
pnpm start:prod
```

## Health Check

Check if the server is running:
`GET http://localhost:3000/api/healthz`

Response:

```json
{
  "ok": true
}
```

## Project Structure

- `src/modules/health`: Health check endpoint
- `src/modules/storage`: Database access (Prisma + Repositories)
- `src/modules/app-config`: App configuration
- `src/modules/session`: Session management
- `src/modules/history`: History management
- `src/modules/feedback`: Feedback management
- `src/modules/share`: Share functionality
- `src/modules/message`: Message handling (send, stream)
- `prisma/schema.prisma`: Database schema definition

## API Examples

### 1. Get App Config

```bash
curl http://localhost:3000/api/app/config
```

Expected Response:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "disclaimer": { ... },
    "tools": [ ... ],
    "limits": { ... }
  }
}
```

### 2. Create Session

```bash
curl -X POST http://localhost:3000/api/session/create \
  -H "Content-Type: application/json" \
  -d '{"title": "My Health Chat"}'
```

Expected Response:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "session": { "session_id": "...", "title": "My Health Chat", ... },
    "welcome_messages": [ ... ],
    "disclaimer": { ... }
  }
}
```

### 3. Send Message (Step 3)

```bash
curl -X POST http://localhost:3000/api/message/send \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "06bbebb5-a250-4866-b7cf-2bcc7182130e",
    "client_message_id": "unique_client_id_001",
    "content": "我头痛怎么办"
  }'
```

Expected Response:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user_message_id": "...",
    "assistant_message_id": "msg_a_...",
    "stream": {
      "protocol": "sse",
      "stream_url": "/api/message/stream?session_id=...&message_id=msg_a_...&token=dev_token_123"
    }
  }
}
```

### 4. Stream Message (Step 4 - SSE)

```bash
curl -N "http://localhost:3000/api/message/stream?session_id=8b2ccdc7-51f1-4005-851b-3a77614d8291&message_id=06bbebb5-a250-4866-b7cf-2bcc7182130e&token=dev_token_123"
```

Expected Output (Stream):

```
event: delta
data: {"message_id":"msg_a_...","text":"### 可能原因\n"}

event: delta
data: {"message_id":"msg_a_...","text":"- 作息不规律\n"}

...

event: done
data: {"final":{...},"cards":[...]}
```

**DB Data Check (After Done):**

- Assistant Message: `status=sent`, `content` updated with full text.
- Two new messages created with `type=card`.

### 5. End Session

```bash
curl -X POST http://localhost:3000/api/session/end \
  -H "Content-Type: application/json" \
  -d '{"session_id": "SESSION_ID_HERE"}'
```

### 6. Get History List

```bash
curl "http://localhost:3000/api/history/list?days=30"
```

Expected Response:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "sessions": [ ... ],
    "has_more": false
  }
}
```

### 7. Get History Detail

```bash
curl "http://localhost:3000/api/history/detail?session_id=SESSION_ID_HERE"
```

Expected Response:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "session": { ... },
    "messages": [ ... ],
    "disclaimer": { ... }
  }
}
```

### 8. Delete Session

```bash
curl -X POST http://localhost:3000/api/history/delete \
  -H "Content-Type: application/json" \
  -d '{"session_id": "SESSION_ID_HERE"}'
```

### 9. Batch Delete Sessions

```bash
curl -X POST http://localhost:3000/api/history/batch_delete \
  -H "Content-Type: application/json" \
  -d '{"session_ids": ["ID1", "ID2"], "mode": "delete"}'
```

### 10. Get Feedback Config

```bash
curl http://localhost:3000/api/feedback/config
```

### 11. Submit Feedback

```bash
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{"message_id": "MSG_ID", "action": "like", "tags": ["Professional"]}'
```

### 12. Render Share Image

```bash
curl -X POST http://localhost:3000/api/share/render_image \
  -H "Content-Type: application/json" \
  -d '{"session_id": "SESSION_ID_HERE"}'
```
