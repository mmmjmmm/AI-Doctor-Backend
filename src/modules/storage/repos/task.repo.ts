import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TaskExecution } from '@prisma/client';

interface CreateTaskInput {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  taskType: string;
  inputPayload?: Record<string, unknown>;
}

@Injectable()
export class TaskRepo {
  constructor(private readonly prisma: PrismaService) {}

  async createTask(input: CreateTaskInput) {
    return this.prisma.taskExecution.create({
      data: {
        session_id: input.sessionId,
        user_message_id: input.userMessageId,
        assistant_message_id: input.assistantMessageId,
        task_type: input.taskType,
        status: 'queued',
        step: 'upload_ready',
        input_payload: input.inputPayload as any,
      },
    });
  }

  async findActiveTaskBySession(sessionId: string): Promise<TaskExecution | null> {
    return this.prisma.taskExecution.findFirst({
      where: {
        session_id: sessionId,
        status: { in: ['queued', 'running'] },
      },
      orderBy: {
        started_at: 'desc',
      },
    });
  }

  async findByAssistantMessageId(
    assistantMessageId: string,
  ): Promise<TaskExecution | null> {
    return this.prisma.taskExecution.findFirst({
      where: {
        assistant_message_id: assistantMessageId,
      },
      orderBy: {
        started_at: 'desc',
      },
    });
  }

  async markRunning(taskId: string, step?: string): Promise<void> {
    await this.prisma.taskExecution.update({
      where: { task_id: taskId },
      data: {
        status: 'running',
        ...(step ? { step } : {}),
      },
    });
  }

  async markCompleted(
    taskId: string,
    resultPayload?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.taskExecution.update({
      where: { task_id: taskId },
      data: {
        status: 'completed',
        step: 'completed',
        finished_at: new Date(),
        ...(resultPayload ? { result_payload: resultPayload as any } : {}),
      },
    });
  }

  async markFailed(
    taskId: string,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.taskExecution.update({
      where: { task_id: taskId },
      data: {
        status: 'failed',
        step: 'failed',
        finished_at: new Date(),
        error_code: errorCode,
        error_message: errorMessage,
      },
    });
  }

  async markInterrupted(taskId: string, reason?: string): Promise<void> {
    await this.prisma.taskExecution.updateMany({
      where: {
        task_id: taskId,
        status: { in: ['queued', 'running'] },
      },
      data: {
        status: 'interrupted',
        step: 'interrupted',
        finished_at: new Date(),
        error_message: reason || 'interrupted',
      },
    });
  }
}
