import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ChatMessage, ConnectionState, MessageRole } from '../types';

type AccessMode = 'default' | 'full-access';

type PersistedSettings = {
  cwd: string;
  recentPaths: string[];
  accessMode: AccessMode;
  multiAgentEnabled: boolean;
};

type State = {
  connectionState: ConnectionState;
  messages: ChatMessage[];
  sessionId: string | null;
  error: string | null;
  activeTurnId: string | null;
  isRunning: boolean;
};

type Action =
  | { type: 'connection'; payload: ConnectionState }
  | { type: 'message'; payload: ChatMessage }
  | { type: 'assistantDelta'; payload: { turnId: string; delta: string } }
  | { type: 'session'; payload: string }
  | { type: 'turnStarted'; payload: string }
  | { type: 'turnCompleted'; payload: { turnId: string; error?: { message?: string } | null } }
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
  const socketRef = useRef<WebSocket | null>(null);
  const manualStopRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cwd, recentPaths, accessMode, multiAgentEnabled }));
  }, [cwd, recentPaths, accessMode, multiAgentEnabled]);

  const updateCwd = useCallback((value: string) => {
    setCwd(convertWindowsPath(value));
  }, []);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socketRef.current = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
  }, []);

  const connect = useCallback(() => {
    closeSocket();
    manualStopRef.current = false;
    const trimmedCwd = cwd.trim();
    setRecentPaths((current) => pushRecentPath(current, trimmedCwd));
    dispatch({ type: 'connection', payload: 'connecting' });
    dispatch({ type: 'error', payload: null });
    dispatch({ type: 'message', payload: createMessage('system', 'Connecting to Codex backend...') });

    const wsUrl = `ws://localhost:3001/ws?cwd=${encodeURIComponent(trimmedCwd)}&accessMode=${encodeURIComponent(
      accessMode
    )}&multiAgent=${multiAgentEnabled ? '1' : '0'}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      dispatch({ type: 'connection', payload: 'connected' });
      dispatch({ type: 'message', payload: createMessage('system', 'Connection established.') });
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
        };

        switch (payload.type) {
          case 'session.started':
            if (payload.sessionId) {
              dispatch({ type: 'session', payload: payload.sessionId });
              dispatch({ type: 'message', payload: createMessage('system', `Codex session started: ${payload.sessionId}`) });
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
      if (!manualStopRef.current) dispatch({ type: 'message', payload: createMessage('system', 'Connection closed.') });
    });
  }, [accessMode, closeSocket, cwd, multiAgentEnabled]);

  useEffect(() => {
    connect();
    return () => {
      manualStopRef.current = true;
      closeSocket();
    };
  }, []);

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

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        dispatch({ type: 'error', payload: 'Socket is not connected.' });
        return false;
      }

      socket.send(JSON.stringify({ type: 'prompt', text: trimmed }));
      dispatch({ type: 'message', payload: createMessage('user', trimmed) });
      dispatch({ type: 'error', payload: null });
      return true;
    },
    [handleCommand]
  );

  const respondToApproval = useCallback((requestId: string | number, action: 'approve' | 'approve-session' | 'decline' | 'cancel') => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: 'approval.respond', requestId, action }));
    return true;
  }, []);

  return {
    connectionState: state.connectionState,
    messages: state.messages,
    sessionId: state.sessionId,
    error: state.error,
    isRunning: state.isRunning,
    canSend: state.connectionState === 'connected' && !state.isRunning,
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
    sendInput,
    stopSession,
    startSession,
    respondToApproval,
  };
}
