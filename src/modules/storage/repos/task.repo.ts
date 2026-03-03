import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

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
}
