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
- `prisma/schema.prisma`: Database schema definition

## API Examples (Step 2)

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

### 3. End Session

```bash
curl -X POST http://localhost:3000/api/session/end \
  -H "Content-Type: application/json" \
  -d '{"session_id": "SESSION_ID_HERE"}'
```

### 4. Get History List

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

### 5. Get History Detail

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

### 6. Delete Session

```bash
curl -X POST http://localhost:3000/api/history/delete \
  -H "Content-Type: application/json" \
  -d '{"session_id": "SESSION_ID_HERE"}'
```

### 7. Batch Delete Sessions

```bash
curl -X POST http://localhost:3000/api/history/batch_delete \
  -H "Content-Type: application/json" \
  -d '{"session_ids": ["ID1", "ID2"], "mode": "delete"}'
```

### 8. Get Feedback Config

```bash
curl http://localhost:3000/api/feedback/config
```

### 9. Submit Feedback

```bash
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{"message_id": "MSG_ID", "action": "like", "tags": ["Professional"]}'
```

### 10. Render Share Image

```bash
curl -X POST http://localhost:3000/api/share/render_image \
  -H "Content-Type: application/json" \
  -d '{"session_id": "SESSION_ID_HERE"}'
```
