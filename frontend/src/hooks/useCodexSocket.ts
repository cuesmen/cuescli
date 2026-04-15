import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AccessMode, ChatMessage, ConnectionState, MessageRole, StoredConversation, TurnDiff } from '../types';

type PersistedSettings = {
  cwd: string;
  recentPaths: string[];
  accessMode: AccessMode;
  multiAgentEnabled: boolean;
  autoOpenChanges: boolean;
};

type ConnectionOverrides = {
  cwd?: string;
  accessMode?: AccessMode;
  multiAgentEnabled?: boolean;
  conversationId?: string;
  announce?: boolean;
};

type State = {
  connectionState: ConnectionState;
  messages: ChatMessage[];
  sessionId: string | null;
  error: string | null;
  activeTurnId: string | null;
  isRunning: boolean;
  turnDiffs: TurnDiff[];
  queuedPrompts: Array<{ id: string; text: string; timestamp: number }>;
};

type Action =
  | { type: 'connection'; payload: ConnectionState }
  | { type: 'message'; payload: ChatMessage }
  | { type: 'promptDispatched' }
  | { type: 'assistantDelta'; payload: { turnId: string; delta: string } }
  | { type: 'session'; payload: string }
  | { type: 'turnStarted'; payload: string }
  | { type: 'turnCompleted'; payload: { turnId: string; error?: { message?: string } | null } }
  | { type: 'turnDiff'; payload: TurnDiff }
  | { type: 'removeTurnDiff'; payload: { turnId: string } }
  | { type: 'removeTurnDiffFile'; payload: { turnId: string; path: string } }
  | { type: 'enqueuePrompt'; payload: { id: string; text: string; timestamp: number } }
  | { type: 'dequeuePrompt'; payload: { id: string } }
  | { type: 'hydrateConversation'; payload: { messages: ChatMessage[]; turnDiffs: TurnDiff[] } }
  | { type: 'approvalResolved'; payload: { requestId: string | number; action: string } }
  | { type: 'clearSession' }
  | { type: 'error'; payload: string | null };

const STORAGE_KEY = 'cuescli.codex.settings.v2';

const initialState: State = {
  connectionState: 'disconnected',
  messages: [],
  sessionId: null,
  error: null,
  activeTurnId: null,
  isRunning: false,
  turnDiffs: [],
  queuedPrompts: [],
};

function createMessage(role: MessageRole, content: string, options = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
    ...options,
  } as ChatMessage;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'connection':
      return { ...state, connectionState: action.payload };
    case 'message':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'promptDispatched':
      return { ...state, isRunning: true };
    case 'assistantDelta': {
      const messages = [...state.messages];
      const lastMessage = messages[messages.length - 1];

      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.turnId === action.payload.turnId) {
        messages[messages.length - 1] = {
          ...lastMessage,
          content: `${lastMessage.content}${action.payload.delta}`,
          timestamp: Date.now(),
        };
      } else {
        messages.push(createMessage('assistant', action.payload.delta, { turnId: action.payload.turnId }));
      }

      return { ...state, messages, activeTurnId: action.payload.turnId, isRunning: true };
    }
    case 'session':
      return { ...state, sessionId: action.payload };
    case 'turnStarted':
      return { ...state, activeTurnId: action.payload, isRunning: true };
    case 'turnCompleted':
      return {
        ...state,
        activeTurnId: state.activeTurnId === action.payload.turnId ? null : state.activeTurnId,
        isRunning: false,
        messages: action.payload.error?.message
          ? [...state.messages, createMessage('error', action.payload.error.message, { turnId: action.payload.turnId })]
          : state.messages,
      };
    case 'turnDiff':
      if (action.payload.available !== false && action.payload.files.length === 0) {
        return state;
      }
      return {
        ...state,
        turnDiffs: [action.payload, ...state.turnDiffs.filter((item) => item.turnId !== action.payload.turnId)],
      };
    case 'removeTurnDiff':
      return {
        ...state,
        turnDiffs: state.turnDiffs.filter((item) => item.turnId !== action.payload.turnId),
      };
    case 'removeTurnDiffFile':
      return {
        ...state,
        turnDiffs: state.turnDiffs
          .map((item) =>
            item.turnId === action.payload.turnId
              ? { ...item, files: item.files.filter((file) => file.path !== action.payload.path) }
              : item
          )
          .filter((item) => item.files.length > 0 || item.available === false),
      };
    case 'enqueuePrompt':
      {
        const queuedMessage = createMessage('queued', action.payload.text, { queueId: action.payload.id });

        return {
          ...state,
          queuedPrompts: [...state.queuedPrompts, action.payload],
          messages: [...state.messages, queuedMessage],
        };
      }
    case 'dequeuePrompt':
      return {
        ...state,
        queuedPrompts: state.queuedPrompts.filter((item) => item.id !== action.payload.id),
        messages: state.messages.map((message) =>
          message.queueId === action.payload.id
            ? { ...message, role: 'user', queueId: undefined }
            : message
        ),
      };
    case 'hydrateConversation':
      return {
        ...state,
        connectionState: 'disconnected',
        messages: action.payload.messages,
        sessionId: null,
        error: null,
        activeTurnId: null,
        isRunning: false,
        turnDiffs: action.payload.turnDiffs,
        queuedPrompts: [],
      };
    case 'approvalResolved':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.approval?.requestId === action.payload.requestId
            ? {
                ...message,
                approval: {
                  ...message.approval,
                  resolved: true,
                },
                content: `${message.content}\nDecision: ${action.payload.action}`,
              }
            : message
        ),
      };
    case 'clearSession':
      return { ...state, connectionState: 'disconnected', sessionId: null, activeTurnId: null, isRunning: false };
    case 'error':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

function formatStatus(status: { type?: string; activeFlags?: string[] } | string) {
  if (typeof status === 'string') return status;
  if (status.type === 'active' && Array.isArray(status.activeFlags)) return `active (${status.activeFlags.join(', ') || 'running'})`;
  return status.type || 'unknown';
}

function readPersistedSettings(): PersistedSettings {
  const fallback: PersistedSettings = {
    cwd: '/home/cues/cuescli/backend',
    recentPaths: ['/home/cues/cuescli/backend'],
    accessMode: 'default',
    multiAgentEnabled: false,
    autoOpenChanges: false,
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    const cwd = typeof parsed.cwd === 'string' && parsed.cwd ? parsed.cwd : fallback.cwd;
    const recentPaths = Array.isArray(parsed.recentPaths) ? parsed.recentPaths.filter(Boolean).slice(0, 10) : [cwd];

    return {
      cwd,
      recentPaths: recentPaths.length > 0 ? recentPaths : [cwd],
      accessMode: parsed.accessMode === 'full-access' ? 'full-access' : 'default',
      multiAgentEnabled: parsed.multiAgentEnabled === true,
      autoOpenChanges: parsed.autoOpenChanges === true,
    };
  } catch {
    return fallback;
  }
}

function pushRecentPath(list: string[], cwd: string) {
  const trimmed = cwd.trim();
  if (!trimmed) return list;
  return [trimmed, ...list.filter((item) => item !== trimmed)].slice(0, 10);
}

function looksLikeWindowsPath(value: string) {
  return /^[A-Za-z]:[\\/]/.test(value.trim());
}

function convertWindowsPath(value: string) {
  const trimmed = value.trim();
  if (!looksLikeWindowsPath(trimmed)) return trimmed;

  const normalized = trimmed.replace(/\\/g, '/');
  const drive = normalized[0].toLowerCase();
  const remainder = normalized.slice(2);
  return `/mnt/${drive}${remainder}`;
}

function formatApprovalMessage(method: string, params: Record<string, unknown>) {
  switch (method) {
    case 'item/commandExecution/requestApproval':
      return `Command approval requested${typeof params.command === 'string' ? `: ${params.command}` : ''}`;
    case 'item/fileChange/requestApproval':
      return `File change approval requested${typeof params.reason === 'string' && params.reason ? `: ${params.reason}` : ''}`;
    case 'item/permissions/requestApproval':
      return `Permission approval requested${typeof params.reason === 'string' && params.reason ? `: ${params.reason}` : ''}`;
    default:
      return `Approval requested: ${method}`;
  }
}

export function useCodexSocket() {
  const persisted = useRef(readPersistedSettings());
  const [state, dispatch] = useReducer(reducer, initialState);
  const [cwd, setCwd] = useState(persisted.current.cwd);
  const [recentPaths, setRecentPaths] = useState<string[]>(persisted.current.recentPaths);
  const [accessMode, setAccessMode] = useState<AccessMode>(persisted.current.accessMode);
  const [multiAgentEnabled, setMultiAgentEnabled] = useState<boolean>(persisted.current.multiAgentEnabled);
  const [autoOpenChanges, setAutoOpenChanges] = useState<boolean>(persisted.current.autoOpenChanges);
  const socketRef = useRef<WebSocket | null>(null);
  const manualStopRef = useRef(false);
  const flushInFlightRef = useRef(false);
  const busyRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const suppressNextCloseMessageRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cwd, recentPaths, accessMode, multiAgentEnabled, autoOpenChanges }));
  }, [cwd, recentPaths, accessMode, multiAgentEnabled, autoOpenChanges]);

  useEffect(() => {
    busyRef.current = state.connectionState === 'connected' && state.isRunning;
  }, [state.connectionState, state.isRunning]);

  const updateCwd = useCallback((value: string) => {
    setCwd(convertWindowsPath(value));
  }, []);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socketRef.current = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
  }, []);

  const sendPromptNow = useCallback((text: string, options = { echoUserMessage: true }) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      dispatch({ type: 'error', payload: 'Socket is not connected.' });
      return false;
    }

    busyRef.current = true;
    dispatch({ type: 'promptDispatched' });
    socket.send(JSON.stringify({ type: 'prompt', text }));
    if (options.echoUserMessage) {
      dispatch({ type: 'message', payload: createMessage('user', text) });
    }
    dispatch({ type: 'error', payload: null });
    return true;
  }, []);

  const connect = useCallback((overrides: ConnectionOverrides = {}) => {
    const announce = overrides.announce !== false;
    if (!announce) {
      suppressNextCloseMessageRef.current = true;
    }

    closeSocket();
    manualStopRef.current = false;
    const nextCwd = typeof overrides.cwd === 'string' ? overrides.cwd : cwd;
    const nextAccessMode = typeof overrides.accessMode === 'string' ? overrides.accessMode : accessMode;
    const nextMultiAgentEnabled =
      typeof overrides.multiAgentEnabled === 'boolean' ? overrides.multiAgentEnabled : multiAgentEnabled;
    const nextConversationId =
      typeof overrides.conversationId === 'string' ? overrides.conversationId : activeConversationIdRef.current;
    const trimmedCwd = nextCwd.trim();
    setRecentPaths((current) => pushRecentPath(current, trimmedCwd));
    dispatch({ type: 'connection', payload: 'connecting' });
    dispatch({ type: 'error', payload: null });
    if (announce) {
      dispatch({ type: 'message', payload: createMessage('system', 'Connecting to Codex backend...') });
    }

    const params = new URLSearchParams({
      cwd: trimmedCwd,
      accessMode: nextAccessMode,
      multiAgent: nextMultiAgentEnabled ? '1' : '0',
    });

    if (nextConversationId) {
      params.set('conversationId', nextConversationId);
    }

    const wsUrl = `ws://localhost:3001/ws?${params.toString()}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      dispatch({ type: 'connection', payload: 'connected' });
      if (announce) {
        dispatch({ type: 'message', payload: createMessage('system', 'Connection established.') });
      }
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          type: string;
          sessionId?: string;
          message?: string;
          details?: string;
          turnId?: string;
          delta?: string;
          status?: { type?: string; activeFlags?: string[] } | string;
          error?: { message?: string } | null;
          code?: number | null;
          signal?: string | null;
          requestId?: string | number;
          method?: string;
          params?: Record<string, unknown>;
          action?: string;
          available?: boolean;
          repoRoot?: string | null;
          reason?: string;
          files?: TurnDiff['files'];
        };

        switch (payload.type) {
          case 'session.started':
            if (payload.sessionId) {
              dispatch({ type: 'session', payload: payload.sessionId });
              if (announce) {
                dispatch({ type: 'message', payload: createMessage('system', `Codex session started: ${payload.sessionId}`) });
              }
            }
            break;
          case 'assistant.delta':
            if (payload.turnId) dispatch({ type: 'assistantDelta', payload: { turnId: payload.turnId, delta: payload.delta ?? '' } });
            break;
          case 'turn.started':
            if (payload.turnId) dispatch({ type: 'turnStarted', payload: payload.turnId });
            break;
          case 'turn.completed':
            if (payload.turnId) dispatch({ type: 'turnCompleted', payload: { turnId: payload.turnId, error: payload.error } });
            break;
          case 'turn.diff':
            if (payload.turnId) {
              dispatch({
                type: 'turnDiff',
                payload: {
                  turnId: payload.turnId,
                  available: payload.available !== false,
                  repoRoot: payload.repoRoot ?? null,
                  reason: payload.reason,
                  files: Array.isArray(payload.files) ? payload.files : [],
                },
              });
            }
            break;
          case 'thread.status':
            if (payload.status) {
              dispatch({
                type: 'message',
                payload: createMessage('system', `Thread status: ${formatStatus(payload.status)}`, { kind: 'thread-status' }),
              });
            }
            break;
          case 'approval.request':
            if (payload.requestId !== undefined && payload.method && payload.params) {
              dispatch({
                type: 'message',
                payload: createMessage('approval', formatApprovalMessage(payload.method, payload.params), {
                  approval: {
                    requestId: payload.requestId,
                    method: payload.method,
                    params: payload.params,
                    resolved: false,
                  },
                }),
              });
            }
            break;
          case 'approval.resolved':
            if (payload.requestId !== undefined && payload.action) {
              dispatch({ type: 'approvalResolved', payload: { requestId: payload.requestId, action: payload.action } });
            }
            break;
          case 'warning':
            dispatch({ type: 'message', payload: createMessage('system', payload.message ?? 'Warning') });
            break;
          case 'session.ended':
            dispatch({
              type: 'message',
              payload: createMessage(
                'system',
                `Codex session ended${payload.code !== null && payload.code !== undefined ? ` with code ${payload.code}` : ''}${
                  payload.signal ? ` (${payload.signal})` : ''
                }.`
              ),
            });
            manualStopRef.current = true;
            closeSocket();
            dispatch({ type: 'clearSession' });
            break;
          case 'error':
            dispatch({ type: 'error', payload: payload.details || payload.message || 'Unknown WebSocket error' });
            dispatch({
              type: 'message',
              payload: createMessage('error', `${payload.message ?? 'Error'}${payload.details ? `: ${payload.details}` : ''}`),
            });
            break;
          default:
            dispatch({ type: 'message', payload: createMessage('system', `Unhandled event: ${payload.type}`) });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse server message';
        dispatch({ type: 'error', payload: message });
        dispatch({ type: 'message', payload: createMessage('error', message) });
      }
    });

    socket.addEventListener('error', () => {
      if (!manualStopRef.current) dispatch({ type: 'error', payload: 'WebSocket error. Check backend availability.' });
    });

    socket.addEventListener('close', () => {
      dispatch({ type: 'clearSession' });
      if (suppressNextCloseMessageRef.current) {
        suppressNextCloseMessageRef.current = false;
        return;
      }
      if (!manualStopRef.current) dispatch({ type: 'message', payload: createMessage('system', 'Connection closed.') });
    });
  }, [accessMode, closeSocket, cwd, multiAgentEnabled]);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      closeSocket();
    };
  }, [closeSocket]);

  useEffect(() => {
    if (state.connectionState !== 'connected' || state.isRunning || flushInFlightRef.current || state.queuedPrompts.length === 0) {
      return;
    }

    const nextPrompt = state.queuedPrompts[0];
    flushInFlightRef.current = true;
    dispatch({ type: 'dequeuePrompt', payload: { id: nextPrompt.id } });
    const sent = sendPromptNow(nextPrompt.text, { echoUserMessage: false });
    flushInFlightRef.current = false;

    if (!sent) {
      dispatch({ type: 'enqueuePrompt', payload: nextPrompt });
    }
  }, [sendPromptNow, state.connectionState, state.isRunning, state.queuedPrompts]);

  const stopSession = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      manualStopRef.current = true;
      closeSocket();
      dispatch({ type: 'clearSession' });
      return;
    }
    manualStopRef.current = true;
    socket.send(JSON.stringify({ type: 'terminate', signal: 'SIGTERM' }));
  }, [closeSocket]);

  const startSession = useCallback(() => {
    connect();
  }, [connect]);

  const openConversation = useCallback(
    (conversation: StoredConversation) => {
      activeConversationIdRef.current = conversation.id;
      setCwd(conversation.cwd);
      setAccessMode(conversation.accessMode);
      setMultiAgentEnabled(conversation.multiAgentEnabled);
      dispatch({
        type: 'hydrateConversation',
        payload: {
          messages: conversation.messages || [],
          turnDiffs: conversation.turnDiffs || [],
        },
      });
      connect({
        cwd: conversation.cwd,
        accessMode: conversation.accessMode,
        multiAgentEnabled: conversation.multiAgentEnabled,
        conversationId: conversation.id,
        announce: false,
      });
    },
    [connect]
  );

  const startFreshConversation = useCallback(
    (conversation: StoredConversation) => {
      activeConversationIdRef.current = conversation.id;
      setCwd(conversation.cwd);
      setAccessMode(conversation.accessMode);
      setMultiAgentEnabled(conversation.multiAgentEnabled);
      dispatch({
        type: 'hydrateConversation',
        payload: {
          messages: [],
          turnDiffs: [],
        },
      });
      connect({
        cwd: conversation.cwd,
        accessMode: conversation.accessMode,
        multiAgentEnabled: conversation.multiAgentEnabled,
        conversationId: conversation.id,
        announce: false,
      });
    },
    [connect]
  );

  const handleCommand = useCallback(
    (input: string) => {
      const trimmed = input.trim();
      if (!trimmed.startsWith('/')) return false;
      const [command, ...rest] = trimmed.split(/\s+/);
      const value = rest.join(' ').trim();

      switch (command) {
        case '/approvals':
          if (value === 'default' || value === 'full-access') {
            setAccessMode(value);
            dispatch({ type: 'message', payload: createMessage('system', `Access mode set to ${value}.`) });
          } else {
            dispatch({ type: 'message', payload: createMessage('error', 'Usage: /approvals default|full-access') });
          }
          return true;
        case '/cwd':
          if (value) {
            const nextCwd = convertWindowsPath(value);
            setCwd(nextCwd);
            setRecentPaths((current) => pushRecentPath(current, nextCwd));
            dispatch({ type: 'message', payload: createMessage('system', `Working directory set to ${nextCwd}.`) });
          } else {
            dispatch({ type: 'message', payload: createMessage('error', 'Usage: /cwd /absolute/path') });
          }
          return true;
        case '/multiagent':
          if (value === 'on' || value === 'off') {
            setMultiAgentEnabled(value === 'on');
            dispatch({ type: 'message', payload: createMessage('system', `Multi-agent mode ${value === 'on' ? 'enabled' : 'disabled'}.`) });
          } else {
            dispatch({ type: 'message', payload: createMessage('error', 'Usage: /multiagent on|off') });
          }
          return true;
        case '/start':
          startSession();
          return true;
        case '/stop':
          stopSession();
          return true;
        default:
          dispatch({
            type: 'message',
            payload: createMessage('error', 'Unknown command. Supported: /approvals, /cwd, /multiagent, /start, /stop'),
          });
          return true;
      }
    },
    [startSession, stopSession]
  );

  const sendInput = useCallback(
    (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return false;
      if (handleCommand(trimmed)) return true;

      if (state.connectionState !== 'connected') {
        dispatch({ type: 'error', payload: 'Socket is not connected.' });
        return false;
      }

      if (busyRef.current) {
        dispatch({
          type: 'enqueuePrompt',
          payload: {
            id: crypto.randomUUID(),
            text: trimmed,
            timestamp: Date.now(),
          },
        });
        dispatch({ type: 'error', payload: null });
        return true;
      }

      return sendPromptNow(trimmed);
    },
    [handleCommand, sendPromptNow, state.connectionState]
  );

  const respondToApproval = useCallback((requestId: string | number, action: 'approve' | 'approve-session' | 'decline' | 'cancel') => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: 'approval.respond', requestId, action }));
    return true;
  }, []);

  const terminateConversation = useCallback((conversationId: string, signal = 'SIGTERM') => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: 'terminate.conversation', conversationId, signal }));
    return true;
  }, []);

  return {
    connectionState: state.connectionState,
    messages: state.messages,
    sessionId: state.sessionId,
    error: state.error,
    isRunning: state.isRunning,
    turnDiffs: state.turnDiffs,
    queuedPrompts: state.queuedPrompts,
    canSend: state.connectionState === 'connected',
    cwd,
    setCwd: updateCwd,
    convertWindowsPath,
    recentPaths,
    selectRecentPath: (value: string) => {
      const nextCwd = convertWindowsPath(value);
      setCwd(nextCwd);
      setRecentPaths((current) => pushRecentPath(current, nextCwd));
    },
    removeRecentPath: (value: string) => {
      setRecentPaths((current) => current.filter((item) => item !== value));
    },
    accessMode,
    setAccessMode,
    multiAgentEnabled,
    setMultiAgentEnabled,
    autoOpenChanges,
    setAutoOpenChanges,
    activeConversationId: activeConversationIdRef.current,
    openConversation,
    startFreshConversation,
    sendInput,
    stopSession,
    startSession,
    respondToApproval,
    terminateConversation,
    removeTurnDiff: (turnId: string) => dispatch({ type: 'removeTurnDiff', payload: { turnId } }),
    removeTurnDiffFile: (turnId: string, path: string) => dispatch({ type: 'removeTurnDiffFile', payload: { turnId, path } }),
  };
}
