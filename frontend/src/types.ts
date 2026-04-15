export type MessageRole = 'user' | 'assistant' | 'system' | 'error' | 'approval' | 'queued';

export interface TurnDiffFile {
  path: string;
  status: string;
  beforePatch: string;
  afterPatch: string;
  beforeContent?: string | null;
  afterContent?: string | null;
}

export interface TurnDiff {
  turnId: string;
  available: boolean;
  repoRoot: string | null;
  reason?: string;
  files: TurnDiffFile[];
}

export type AccessMode = 'default' | 'full-access';

export interface StoredConversation {
  id: string;
  title: string;
  cwd: string;
  accessMode: AccessMode;
  multiAgentEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  turnDiffs: TurnDiff[];
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  turnId?: string;
  queueId?: string;
  kind?: 'thread-status';
  approval?: {
    requestId: string | number;
    method: string;
    params: Record<string, unknown>;
    resolved?: boolean;
  };
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';
