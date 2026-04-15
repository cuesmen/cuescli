export type MessageRole = 'user' | 'assistant' | 'system' | 'error' | 'approval';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  turnId?: string;
  kind?: 'thread-status';
  approval?: {
    requestId: string | number;
    method: string;
    params: Record<string, unknown>;
    resolved?: boolean;
  };
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';
