import { TaskContext } from '../../../common/types/chat.types';

export interface SendMessageDto {
  session_id: string;
  client_message_id: string;
  content?: string;
  task_context?: TaskContext;
  attachment_ids?: string[];

  // Backward compatibility for current clients.
  attachments?: any[];
  type?: string;
}
