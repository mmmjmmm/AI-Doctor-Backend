-- CreateTable
CREATE TABLE "attachments" (
    "attachment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "message_id" TEXT,
    "kind" TEXT NOT NULL,
    "biz_type" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "public_url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateTable
CREATE TABLE "task_executions" (
    "task_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_message_id" TEXT NOT NULL,
    "assistant_message_id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "step" TEXT,
    "input_payload" JSONB,
    "result_payload" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "task_executions_pkey" PRIMARY KEY ("task_id")
);

-- CreateIndex
CREATE INDEX "attachments_session_id_created_at_idx" ON "attachments"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "attachments_message_id_idx" ON "attachments"("message_id");

-- CreateIndex
CREATE INDEX "task_executions_session_id_started_at_idx" ON "task_executions"("session_id", "started_at");

-- CreateIndex
CREATE INDEX "task_executions_assistant_message_id_idx" ON "task_executions"("assistant_message_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("message_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_user_message_id_fkey" FOREIGN KEY ("user_message_id") REFERENCES "messages"("message_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_assistant_message_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "messages"("message_id") ON DELETE RESTRICT ON UPDATE CASCADE;
