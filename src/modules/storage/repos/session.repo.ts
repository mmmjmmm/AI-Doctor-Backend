import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Session } from '@prisma/client';

export interface ISessionRepo {
  createSession(userId: string, title?: string): Promise<Session>;
  endSession(sessionId: string): Promise<void>;
  softDeleteSession(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<Session | null>;
  listSessions(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<Session[]>;
  batchSoftDelete(sessionIds: string[]): Promise<void>;
  updateSessionTitle(sessionId: string, title: string): Promise<void>;
}

@Injectable()
export class SessionRepo implements ISessionRepo {
  constructor(private prisma: PrismaService) {}

  async createSession(userId: string, title?: string): Promise<Session> {
    return this.prisma.session.create({
      data: {
        user_id: userId,
        title: title || 'New Chat',
        status: 'active',
      },
    });
  }

  async endSession(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { session_id: sessionId },
      data: {
        status: 'ended',
        ended_at: new Date(),
      },
    });
  }

  async softDeleteSession(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { session_id: sessionId },
      data: {
        status: 'deleted',
        deleted_at: new Date(),
      },
    });
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: { session_id: sessionId },
    });
  }

  async listSessions(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: {
        user_id: userId,
        status: { not: 'deleted' }, // Filter out deleted sessions
      },
      orderBy: { started_at: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async batchSoftDelete(sessionIds: string[]): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        session_id: { in: sessionIds },
      },
      data: {
        status: 'deleted',
        deleted_at: new Date(),
      },
    });
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await this.prisma.session.update({
      where: { session_id: sessionId },
      data: { title },
    });
  }
}
