export const TASK_TYPES = [
  'chat',
  'report_interpret',
  'body_part',
  'ingredient',
  'drug',
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const MESSAGE_STATUSES = [
  'sending',
  'sent',
  'failed',
  'deleted',
  'interrupted',
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_TYPES = ['text', 'image', 'card', 'status'] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export type TaskEntry = 'quick_tool' | 'composer' | 'history_retry';

export interface TaskContextImage {
  file_id: string;
  url: string;
}

export interface TaskContext {
  task_type: TaskType;
  entry: TaskEntry;
  images?: TaskContextImage[];
  extra?: Record<string, unknown>;
}
