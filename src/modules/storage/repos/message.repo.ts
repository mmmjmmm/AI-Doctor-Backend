import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Message } from '@prisma/client';

export interface UserMessageContext {
  content: string;
  attachments: any[];
}

export interface IMessageRepo {
  createUserMessage(
    sessionId: string,
    clientMessageId: string,
    content: string,
    attachments: any[],
  ): Promise<Message>;
  createAssistantPlaceholder(sessionId: string): Promise<Message>;
  createMessagePair(
    sessionId: string,
    clientMessageId: string,
    content: string,
    attachments: any[],
  ): Promise<{ userMessage: Message; assistantMessage: Message }>;
  findAssistantMessageByClientMessageId(
    sessionId: string,
    clientMessageId: string,
  ): Promise<Message | null>;
  findUserMessageByClientMessageId(
    sessionId: string,
    clientMessageId: string,
  ): Promise<Message | null>;
  getAssistantSendingMessage(
    sessionId: string,
    messageId: string,
  ): Promise<Message | null>;
  getMessageById(messageId: string): Promise<Message | null>;
  getAssistantMessageWithSession(
    sessionId: string,
    messageId: string,
  ): Promise<Message | null>;
  findLatestActiveAssistantBySession(sessionId: string): Promise<Message | null>;
  finishAssistantText(
    messageId: string,
    content: string,
    contentRich: any | null,
    disclaimerBottom?: string,
  ): Promise<Message>;
  insertCardMessage(sessionId: string, card: any): Promise<Message>;
  markFailed(messageId: string): Promise<void>;
  markInterrupted(messageId: string, content?: string): Promise<void>;
  markInterruptedIfSending(messageId: string, content?: string): Promise<boolean>;
  listRecent(
    sessionId: string,
    limit: number,
  ): Promise<Array<{ role: string; content: string }>>;
  getUserMessageContextByAssistantId(
    assistantMessageId: string,
  ): Promise<UserMessageContext | null>;
  listBySessionId(sessionId: string): Promise<Message[]>;
  countUserMessages(sessionId: string): Promise<number>;
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

  async createMessagePair(
    sessionId: string,
    clientMessageId: string,
    content: string,
    attachments: any[],
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    return this.prisma.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
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

      const assistantMessage = await tx.message.create({
        data: {
          session_id: sessionId,
          role: 'assistant',
          type: 'text',
          content: '',
          status: 'sending',
        },
      });

      return { userMessage, assistantMessage };
    });
  }

  async findAssistantMessageByClientMessageId(
    sessionId: string,
    clientMessageId: string,
  ): Promise<Message | null> {
    const userMessage = await this.prisma.message.findUnique({
      where: {
        session_id_client_message_id: {
          session_id: sessionId,
          client_message_id: clientMessageId,
        },
      },
    });

    if (!userMessage) {
      return null;
    }

    return this.prisma.message.findFirst({
      where: {
        session_id: sessionId,
        role: 'assistant',
        created_at: {
          gte: userMessage.created_at,
        },
      },
      orderBy: {
        created_at: 'asc',
      },
    });
  }

  async findUserMessageByClientMessageId(
    sessionId: string,
    clientMessageId: string,
  ): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: {
        session_id_client_message_id: {
          session_id: sessionId,
          client_message_id: clientMessageId,
        },
      },
    });
  }

  async getAssistantSendingMessage(
    sessionId: string,
    messageId: string,
  ): Promise<Message | null> {
    return this.prisma.message.findFirst({
      where: {
        message_id: messageId,
        session_id: sessionId,
        role: 'assistant',
        status: 'sending',
      },
    });
  }

  async getMessageById(messageId: string): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { message_id: messageId },
    });
  }

  async getAssistantMessageWithSession(
    sessionId: string,
    messageId: string,
  ): Promise<Message | null> {
    return this.prisma.message.findFirst({
      where: {
        message_id: messageId,
        session_id: sessionId,
        role: 'assistant',
      },
    });
  }

  async findLatestActiveAssistantBySession(
    sessionId: string,
  ): Promise<Message | null> {
    return this.prisma.message.findFirst({
      where: {
        session_id: sessionId,
        role: 'assistant',
        status: 'sending',
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async finishAssistantText(
    messageId: string,
    content: string,
    contentRich: any | null,
    disclaimerBottom?: string,
  ): Promise<Message> {
    const data: any = {
      content,
      status: 'sent',
    };
    if (contentRich) {
      data.content_rich = contentRich;
    }
    // Note: disclaimerBottom is not stored in DB schema yet, ignoring as per Step 1 schema

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

  async markInterrupted(messageId: string, content?: string): Promise<void> {
    await this.prisma.message.update({
      where: { message_id: messageId },
      data: {
        status: 'interrupted',
        ...(typeof content === 'string' ? { content } : {}),
      },
    });
  }

  async markInterruptedIfSending(
    messageId: string,
    content?: string,
  ): Promise<boolean> {
    const result = await this.prisma.message.updateMany({
      where: {
        message_id: messageId,
        status: 'sending',
      },
      data: {
        status: 'interrupted',
        ...(typeof content === 'string' ? { content } : {}),
      },
    });

    return result.count > 0;
  }

  async listRecent(
    sessionId: string,
    limit: number,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.prisma.message.findMany({
      where: {
        session_id: sessionId,
        status: 'sent',
        type: 'text',
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });
    return messages.reverse();
  }

  async getUserMessageContextByAssistantId(
    assistantMessageId: string,
  ): Promise<UserMessageContext | null> {
    const assistantMsg = await this.prisma.message.findUnique({
      where: { message_id: assistantMessageId },
    });
    if (!assistantMsg) return null;

    const userMsg = await this.prisma.message.findFirst({
      where: {
        session_id: assistantMsg.session_id,
        role: 'user',
        created_at: { lt: assistantMsg.created_at },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!userMsg) {
      return null;
    }

    return {
      content: userMsg.content || '',
      attachments: Array.isArray(userMsg.attachments) ? userMsg.attachments : [],
    };
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

  async countUserMessages(sessionId: string): Promise<number> {
    return this.prisma.message.count({
      where: {
        session_id: sessionId,
        role: 'user',
      },
    });
  }
}
