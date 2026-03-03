import { Injectable } from "@nestjs/common";

export type RuntimeStage =
  | "policy_running"
  | "answer_streaming"
  | "finalizing";

export type RuntimeInterruptReason = "stop" | "preempt" | "disconnect";

export interface RuntimeEntry {
  sessionId: string;
  assistantMessageId: string;
  taskId: string;
  abortController: AbortController;
  stage: RuntimeStage;
  interruptedBy?: RuntimeInterruptReason;
  accumulatedText: string;
}

@Injectable()
export class MessageRuntimeRegistry {
  private readonly runtimeByAssistantMessageId = new Map<string, RuntimeEntry>();
  private readonly assistantMessageIdBySession = new Map<string, string>();

  register(entry: RuntimeEntry) {
    this.runtimeByAssistantMessageId.set(entry.assistantMessageId, entry);
    this.assistantMessageIdBySession.set(
      entry.sessionId,
      entry.assistantMessageId,
    );
  }

  getBySession(sessionId: string) {
    const assistantMessageId = this.assistantMessageIdBySession.get(sessionId);
    if (!assistantMessageId) {
      return undefined;
    }
    return this.runtimeByAssistantMessageId.get(assistantMessageId);
  }

  getByAssistantMessageId(assistantMessageId: string) {
    return this.runtimeByAssistantMessageId.get(assistantMessageId);
  }

  markStage(assistantMessageId: string, stage: RuntimeStage) {
    const entry = this.runtimeByAssistantMessageId.get(assistantMessageId);
    if (!entry) {
      return;
    }
    entry.stage = stage;
  }

  appendText(assistantMessageId: string, text: string) {
    const entry = this.runtimeByAssistantMessageId.get(assistantMessageId);
    if (!entry || !text) {
      return;
    }
    entry.accumulatedText += text;
  }

  interrupt(
    assistantMessageId: string,
    reason: RuntimeInterruptReason,
  ): RuntimeEntry | undefined {
    const entry = this.runtimeByAssistantMessageId.get(assistantMessageId);
    if (!entry) {
      return undefined;
    }

    entry.interruptedBy = reason;
    if (!entry.abortController.signal.aborted) {
      entry.abortController.abort();
    }

    return entry;
  }

  unregister(assistantMessageId: string) {
    const entry = this.runtimeByAssistantMessageId.get(assistantMessageId);
    if (!entry) {
      return;
    }

    this.runtimeByAssistantMessageId.delete(assistantMessageId);
    const currentAssistantMessageId = this.assistantMessageIdBySession.get(
      entry.sessionId,
    );
    if (currentAssistantMessageId === assistantMessageId) {
      this.assistantMessageIdBySession.delete(entry.sessionId);
    }
  }
}
