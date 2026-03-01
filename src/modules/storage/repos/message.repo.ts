import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Message } from '@prisma/client';

export interface IMessageRepo {
  createUserMessage(
    sessionId: string,
    clientMessageId: string,
    content: string,
    attachments: any[],
  ): Promise<Message>;
  createAssistantPlaceholder(sessionId: string): Promise<Message>;
  finishAssistantText(
    messageId: string,
    content: string,
    contentRich: any | null,
    disclaimerBottom?: string,
  ): Promise<Message>;
  insertCardMessage(sessionId: string, card: any): Promise<Message>;
  markFailed(messageId: string): Promise<void>;
  listRecent(
    sessionId: string,
    limit: number,
  ): Promise<Array<{ role: string; content: string }>>;
  getUserTextByAssistantId(assistantMessageId: string): Promise<string>;
  listBySessionId(sessionId: string): Promise<Message[]>;
}

@Injectable()
export class MessageRepo implements IMessageRepo {
  constructor(private prisma: PrismaService) {}

  async createUserMessage(
    sessionId: string,
    clientMessageId: string,
    content: string,
    attachments: any[],
  ): Promise<Message> {
    // Check for idempotency first (handled by unique constraint usually, but we can check explicitly if needed)
    // Here we rely on Prisma to throw error if unique constraint fails or handle it in service
    return this.prisma.message.create({
      data: {
        session_id: sessionId,
        role: 'user',
        type: 'text',
        content,
        attachments: attachments as any,
        client_message_id: clientMessageId,
        status: 'sent',
      },
    });
  }

  async createAssistantPlaceholder(sessionId: string): Promise<Message> {
    return this.prisma.message.create({
      data: {
        session_id: sessionId,
        role: 'assistant',
        type: 'text',
        content: '',
        status: 'sending',
      },
    });
  }

  async finishAssistantText(
    messageId: string,
    content: string,
    contentRich: any | null,
    disclaimerBottom?: string,
  ): Promise<Message> {
    // Note: disclaimerBottom is not in schema directly, assuming it might be part of content_rich or handled differently.
    // The schema provided in Step 1 for Message:
    // message_id, session_id, role, type, content, content_rich, card, attachments, status, feedback_status, client_message_id...
    // There is no explicit disclaimer_bottom column.
    // If it's part of the response JSON but not DB column, we might just store it in content_rich if needed.
    // Or ignore it for DB storage if it's static.
    // Let's assume content_rich can hold it or we just update content.

    const data: any = {
      content,
      status: 'sent',
    };
    if (contentRich) {
      data.content_rich = contentRich;
    }

    return this.prisma.message.update({
      where: { message_id: messageId },
      data,
    });
  }

  async insertCardMessage(sessionId: string, card: any): Promise<Message> {
    return this.prisma.message.create({
      data: {
        session_id: sessionId,
        role: 'assistant',
        type: 'card',
        card: card,
        status: 'sent',
      },
    });
  }

  async markFailed(messageId: string): Promise<void> {
    await this.prisma.message.update({
      where: { message_id: messageId },
      data: { status: 'failed' },
    });
  }

  async listRecent(
    sessionId: string,
    limit: number,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.prisma.message.findMany({
      where: {
        session_id: sessionId,
        status: 'sent',
        type: 'text', // Only text messages usually relevant for context
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });
    return messages.reverse(); // Return in chronological order
  }

  async getUserTextByAssistantId(assistantMessageId: string): Promise<string> {
    // Find the assistant message
    const assistantMsg = await this.prisma.message.findUnique({
      where: { message_id: assistantMessageId },
    });
    if (!assistantMsg) return '';

    // Find the user message immediately preceding it
    const userMsg = await this.prisma.message.findFirst({
      where: {
        session_id: assistantMsg.session_id,
        role: 'user',
        created_at: { lt: assistantMsg.created_at },
      },
      orderBy: { created_at: 'desc' },
    });

    return userMsg?.content || '';
  }

  async listBySessionId(sessionId: string): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: {
        session_id: sessionId,
        status: { not: 'deleted' },
      },
      orderBy: { created_at: 'asc' },
    });
  }
}
