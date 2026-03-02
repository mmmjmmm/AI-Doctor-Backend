import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import { MessageRepo } from "../storage/repos/message.repo";
import { SessionRepo } from "../storage/repos/session.repo";
import { AppConfigService } from "../app-config/app-config.service";
import { LangChainService } from "./langchain.service";

const DEFAULT_DOWNLOAD_IMG_URL =
  "https://p3-health.byteimg.com/tos-cn-i-49unhts6dw/1a87406450535266c257529433430588.png~tplv-49unhts6dw-image.image";

@Injectable()
export class MessageService {
  constructor(
    private readonly messageRepo: MessageRepo,
    private readonly sessionRepo: SessionRepo,
    private readonly appConfigService: AppConfigService,
    private readonly langChainService: LangChainService,
  ) {}

  async sendMessage(
    sessionId: string,
    clientMessageId: string,
    content: string,
    attachments: any[] = [],
  ) {
    // 1. Validate content
    if (!content || content.trim().length === 0) {
      throw new BadRequestException({
        code: 40001,
        message: "Content cannot be empty",
      });
    }

    const config = this.appConfigService.getConfig();
    if (content.length > config.limits.text_max_len) {
      throw new BadRequestException({
        code: 40002,
        message: `Content length exceeds limit of ${config.limits.text_max_len}`,
      });
    }

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
        attachments,
      );
      userMessage = result.userMessage;
      assistantMessage = result.assistantMessage;

      // New requirement: Update session title if this is the first user message
      const userMsgCount = await this.messageRepo.countUserMessages(sessionId);
      if (userMsgCount === 1) {
        const newTitle = content.substring(0, 10);
        await this.sessionRepo.updateSessionTitle(sessionId, newTitle);
      }
    } catch (error: any) {
      // 4. Handle idempotency (Unique constraint violation)
      if (error.code === "P2002") {
        const existingAssistantMsg =
          await this.messageRepo.findAssistantMessageByClientMessageId(
            sessionId,
            clientMessageId,
          );

        if (existingAssistantMsg) {
          return this.buildResponse(sessionId, existingAssistantMsg.message_id);
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
    return this.buildResponse(sessionId, assistantMessage.message_id);
  }

  private buildResponse(sessionId: string, assistantMessageId: string) {
    const token = "dev_token_123";
    const streamUrl = `/api/message/stream?session_id=${sessionId}&message_id=${assistantMessageId}&token=${token}`;

    return {
      user_message_id: "ignored_in_step3_but_useful",
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
    const userText = await this.messageRepo.getUserTextByAssistantId(messageId);
    if (!userText) {
      throw new NotFoundException("User message context not found");
    }

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

      res.write(`event: error\n`);
      res.write(
        `data: ${JSON.stringify({ code: 50001, message: "AI Service Error" })}\n\n`,
      );
      res.end();
    }
  }
}
