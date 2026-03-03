import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { readFile } from "fs/promises";
import { join } from "path";
import { Response } from "express";
import { MessageRepo } from "../storage/repos/message.repo";
import { SessionRepo } from "../storage/repos/session.repo";
import { AttachmentRepo } from "../storage/repos/attachment.repo";
import { TaskRepo } from "../storage/repos/task.repo";
import { AppConfigService } from "../app-config/app-config.service";
import { LangChainService } from "./langchain.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { TaskContext } from "../../common/types/chat.types";

const DEFAULT_DOWNLOAD_IMG_URL =
  "https://p3-health.byteimg.com/tos-cn-i-49unhts6dw/1a87406450535266c257529433430588.png~tplv-49unhts6dw-image.image";

@Injectable()
export class MessageService {
  constructor(
    private readonly messageRepo: MessageRepo,
    private readonly sessionRepo: SessionRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly taskRepo: TaskRepo,
    private readonly appConfigService: AppConfigService,
    private readonly langChainService: LangChainService,
  ) {}

  async sendMessage(body: SendMessageDto) {
    const sessionId = body.session_id;
    const clientMessageId = body.client_message_id;
    const content = body.content?.trim() || "";
    const attachmentIds = body.attachment_ids || [];
    const hasAttachments = attachmentIds.length > 0;
    const sanitizedTaskContext = this.sanitizeTaskContext(body.task_context);

    // 1. Validate content
    if (!content && !hasAttachments) {
      throw new BadRequestException({
        code: 40001,
        message: "Content and attachments cannot both be empty",
      });
    }

    const config = this.appConfigService.getConfig();
    if (content.length > config.limits.text_max_len) {
      throw new BadRequestException({
        code: 40002,
        message: `Content length exceeds limit of ${config.limits.text_max_len}`,
      });
    }

    if (hasAttachments && !sanitizedTaskContext?.task_type) {
      throw new BadRequestException({
        code: 40005,
        message: "task_context.task_type is required for image tasks",
      });
    }

    const attachments = hasAttachments
      ? await this.attachmentRepo.findReadyByIds(attachmentIds, "mock_user_001")
      : [];

    if (hasAttachments && attachments.length !== attachmentIds.length) {
      throw new BadRequestException({
        code: 40005,
        message: "Some attachments are not ready or do not belong to the current user",
      });
    }

    const messageAttachments = hasAttachments
      ? attachments.map((attachment) => ({
          attachment_id: attachment.attachment_id,
          type: "image",
          ...(this.isDataUrl(attachment.public_url)
            ? {}
            : { url: attachment.public_url }),
          meta: {
            size: attachment.size_bytes,
            mime_type: attachment.mime_type,
            file_name: attachment.file_name,
            biz_type: attachment.biz_type,
          },
        }))
      : this.sanitizeLegacyAttachments(body.attachments || []);

    // 2. Check if session exists (optional but recommended)
    const session = await this.sessionRepo.getSession(sessionId);
    if (!session || session.status === "deleted") {
      throw new BadRequestException("Session not found or deleted");
    }

    // 3. Try to create message pair (User + Assistant Placeholder)
    let userMessage;
    let assistantMessage;

    try {
      const result = await this.messageRepo.createMessagePair(
        sessionId,
        clientMessageId,
        content,
        messageAttachments,
      );
      userMessage = result.userMessage;
      assistantMessage = result.assistantMessage;

      await this.taskRepo.createTask({
        sessionId,
        userMessageId: userMessage.message_id,
        assistantMessageId: assistantMessage.message_id,
        taskType: sanitizedTaskContext?.task_type || "chat",
        inputPayload: {
          task_context: sanitizedTaskContext || null,
          attachment_ids: attachmentIds,
        },
      });

      // New requirement: Update session title if this is the first user message
      const userMsgCount = await this.messageRepo.countUserMessages(sessionId);
      if (userMsgCount === 1) {
        const newTitle = content.substring(0, 10);
        await this.sessionRepo.updateSessionTitle(sessionId, newTitle);
      }
    } catch (error: any) {
      // 4. Handle idempotency (Unique constraint violation)
      if (error.code === "P2002") {
        const existingUserMsg =
          await this.messageRepo.findUserMessageByClientMessageId(
            sessionId,
            clientMessageId,
          );
        const existingAssistantMsg =
          await this.messageRepo.findAssistantMessageByClientMessageId(
            sessionId,
            clientMessageId,
          );

        if (existingAssistantMsg && existingUserMsg) {
          return this.buildResponse(
            sessionId,
            existingAssistantMsg.message_id,
            existingUserMsg,
          );
        } else {
          throw new BadRequestException({
            code: 40901,
            message: "Duplicate message request but execution incomplete",
          });
        }
      }
      throw error;
    }

    // 5. Return stream URL
    return this.buildResponse(sessionId, assistantMessage.message_id, userMessage);
  }

  private isDataUrl(value?: string | null): boolean {
    return typeof value === "string" && value.startsWith("data:");
  }

  private sanitizeTaskContext(taskContext?: TaskContext): TaskContext | undefined {
    if (!taskContext) {
      return undefined;
    }

    return {
      ...taskContext,
      images: taskContext.images?.map((image) => ({
        file_id: image.file_id,
        url: this.isDataUrl(image.url) ? "" : image.url,
      })),
    };
  }

  private extractImageUrls(attachments: any[]): string[] {
    return attachments
      .filter(
        (attachment) =>
          attachment &&
          attachment.type === "image" &&
          typeof attachment.url === "string" &&
          attachment.url.trim().length > 0,
      )
      .map((attachment) => attachment.url.trim());
  }

  private isHttpUrl(value?: string): boolean {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  private isPublicImageUrl(value?: string): boolean {
    if (!this.isHttpUrl(value)) {
      return false;
    }

    try {
      const url = new URL(value as string);
      const hostname = url.hostname.toLowerCase();
      return !["localhost", "127.0.0.1", "::1"].includes(hostname);
    } catch {
      return false;
    }
  }

  private async resolveAttachmentImageInputs(attachments: any[]): Promise<string[]> {
    const imageInputs: string[] = [];

    for (const attachment of attachments) {
      if (!attachment || attachment.type !== "image") {
        continue;
      }

      if (this.isPublicImageUrl(attachment.url)) {
        imageInputs.push(attachment.url.trim());
        continue;
      }

      const attachmentId = attachment.attachment_id;
      if (!attachmentId) {
        continue;
      }

      const record = await this.attachmentRepo.findReadyById(
        attachmentId,
        "mock_user_001",
      );
      if (!record) {
        continue;
      }

      try {
        const filePath = join(process.cwd(), "uploads", record.storage_key);
        const buffer = await readFile(filePath);
        imageInputs.push(
          `data:${record.mime_type};base64,${buffer.toString("base64")}`,
        );
      } catch (error) {
        console.error(
          `[MessageService] Failed to load attachment ${attachmentId}:`,
          error,
        );
      }
    }

    return imageInputs;
  }

  private sanitizeLegacyAttachments(attachments: any[]): any[] {
    return attachments.map((attachment) => {
      if (!attachment || typeof attachment !== "object") {
        return attachment;
      }

      const sanitized = { ...attachment };
      if (this.isDataUrl(sanitized.url)) {
        delete sanitized.url;
      }
      return sanitized;
    });
  }

  private buildResponse(sessionId: string, assistantMessageId: string, userMessage?: any) {
    const token = "dev_token_123";
    const streamUrl = `/api/message/stream?session_id=${sessionId}&message_id=${assistantMessageId}&token=${token}`;

    return {
      user_message_id: userMessage?.message_id || "ignored_in_step3_but_useful",
      user_message: userMessage
        ? {
            message_id: userMessage.message_id,
            session_id: userMessage.session_id,
            role: userMessage.role,
            type: userMessage.type,
            content: userMessage.content,
            attachments: Array.isArray(userMessage.attachments)
              ? userMessage.attachments
              : [],
            status: userMessage.status,
            created_at: userMessage.created_at,
          }
        : null,
      assistant_message_id: assistantMessageId,
      stream: {
        protocol: "sse",
        stream_url: streamUrl,
      },
    };
  }

  private detectUserEndIntent(userText: string): boolean {
    const t = userText.trim();
    // Regex to match "thank you", "bye", "ok", etc.
    return /(谢谢|明白了|可以了|不用了|结束|就这样|不问了|ok|我去医院了|先这样|再见|拜拜|好的|行了)/i.test(
      t,
    );
  }

  async streamMessage(
    sessionId: string,
    messageId: string,
    token: string,
    res: Response,
  ) {
    // 1. Validate message exists and is 'sending'
    const message = await this.messageRepo.getAssistantSendingMessage(
      sessionId,
      messageId,
    );
    if (!message) {
      throw new NotFoundException("Message not found or not in sending status");
    }

    // Get user input for context (needed for prompt)
    const userMessageContext =
      await this.messageRepo.getUserMessageContextByAssistantId(messageId);
    if (!userMessageContext) {
      throw new NotFoundException("User message context not found");
    }

    const userText = userMessageContext.content || "";
    const imageUrls = await this.resolveAttachmentImageInputs(
      userMessageContext.attachments || [],
    );
    const inferredTaskType = imageUrls.length > 0 ? "image" : "chat";

    // 2. Setup headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // 3. Setup AbortController
    const abortController = new AbortController();
    res.on("close", () => {
      abortController.abort();
      res.end();
    });

    let fullText = "";

    try {
      // --- Step 6.1 Policy Stage (Non-streaming) ---
      const recentMessages = await this.messageRepo.listRecent(sessionId, 12);

      const policy = await this.langChainService.runPolicySafe({
        user_text: userText,
        recent_messages: recentMessages,
      });

      console.log("[MessageService] Policy result:", JSON.stringify(policy));

      // --- Step 6.2 Answer Stage (Streaming) ---
      const stream = await this.langChainService.streamResponse(
        {
          user_text: userText,
          recent_messages: recentMessages,
          need_intake_form: policy.need_intake_form,
          intake_question: policy.next_question,
          image_urls: imageUrls,
          task_type:
            (message as any).task_type ||
            userMessageContext.attachments?.[0]?.meta?.biz_type ||
            inferredTaskType,
        },
        abortController.signal,
      );

      for await (const chunk of stream) {
        const text = this.langChainService.extractChunkText(chunk);
        if (text) {
          fullText += text;
          res.write(`event: delta\n`);
          res.write(
            `data: ${JSON.stringify({ message_id: messageId, text })}\n\n`,
          );
        }
      }

      // --- Step 6.3 Finalize Stage ---
      // Update Assistant Text Message
      const config = this.appConfigService.getConfig();
      const disclaimerBottom = config.disclaimer.bottom_hint;

      const finalMessage = await this.messageRepo.finishAssistantText(
        messageId,
        fullText,
        null,
        disclaimerBottom,
      );

      const cards: any[] = [];

      // Determine user intent early to override policy if needed
      const userEndIntent = this.detectUserEndIntent(userText);
      if (userEndIntent) {
        // If user wants to end, do not show intake form even if policy says so
        policy.need_intake_form = false;
      }

      // Handle Download App Card
      if (policy.should_promote_download) {
        const needImage = fullText.length >= 300;
        const dl = await this.langChainService.runDownloadCopySafe({
          user_text: userText,
          answer_md: fullText,
          need_image: needImage,
        });

        if (dl) {
          const downloadCard = {
            card_type: "download_app",
            title: dl.title,
            sub_title: dl.sub_title,
            content: dl.content,
            cta: { text: "立即下载", action: "download" },
            img_url: undefined,
          };

          if (needImage) {
            downloadCard.img_url = DEFAULT_DOWNLOAD_IMG_URL;
          }

          const cardMsg = await this.messageRepo.insertCardMessage(
            sessionId,
            downloadCard,
          );

          cards.push({
            message_id: cardMsg.message_id,
            role: "assistant",
            type: "card",
            card: downloadCard,
            status: "sent",
          });
        }
      }

      // Handle Intake Form Card
      if (policy.need_intake_form && policy.intake_form) {
        const cardMsg = await this.messageRepo.insertCardMessage(
          sessionId,
          policy.intake_form,
        );
        cards.push({
          message_id: cardMsg.message_id,
          role: "assistant",
          type: "card",
          card: policy.intake_form,
          status: "sent",
        });
      }

      // --- Step 7: Consult Summary Card ---
      // Determine closing intent
      let closingIntent = policy.closing_intent;
      // userEndIntent is already calculated above

      console.log(
        `[MessageService] Initial closingIntent: ${closingIntent}, userEndIntent: ${userEndIntent}`,
      );

      // Force closing intent if user explicitly says bye (Overrides intake form)
      if (userEndIntent) {
        closingIntent = "end_by_user";
      }

      console.log(`[MessageService] Final closingIntent: ${closingIntent}`);

      // Generate summary if intent is to end
      if (closingIntent === "end_by_user" || closingIntent === "end_by_model") {
        console.log("[MessageService] Generating summary...");
        const summary = await this.langChainService.runSummarySafe({
          user_text: userText,
          answer_text: fullText,
          disclaimer: disclaimerBottom,
        });

        if (summary) {
          console.log("[MessageService] Summary generated successfully");
          // Ensure disclaimer matches config exactly
          summary.footer = { disclaimer: disclaimerBottom };

          const summaryMsg = await this.messageRepo.insertCardMessage(
            sessionId,
            summary,
          );
          cards.push({
            message_id: summaryMsg.message_id,
            role: "assistant",
            type: "card",
            card: summary,
            status: "sent",
          });
        }
      }

      // Send done event
      const doneData = {
        final: {
          ...finalMessage,
          disclaimer_bottom: disclaimerBottom,
        },
        cards: cards,
      };

      res.write(`event: done\n`);
      res.write(`data: ${JSON.stringify(doneData)}\n\n`);
      res.end();
    } catch (error: any) {
      // Handle Errors
      if (error.name === "AbortError" || error.message === "Cancel") {
        return;
      }

      console.error("Streaming error:", error);

      await this.messageRepo.markFailed(messageId);

      const isMultimodalRequest = imageUrls.length > 0;
      const errorMessage =
        isMultimodalRequest && error?.status === 400
          ? "Multimodal model request rejected. Check OPENAI_VISION_MODEL and provider image input support."
          : "AI Service Error";

      res.write(`event: error\n`);
      res.write(
        `data: ${JSON.stringify({ code: 50001, message: errorMessage })}\n\n`,
      );
      res.end();
    }
  }
}
