# cuescli

> Runtime CLI wrapper & session orchestrator for Codex (and future LLM agents)

cuescli is a lightweight backend + CLI wrapper designed to manage multiple Codex sessions, handle real-time streaming, and orchestrate conversations across clients.

It abstracts Codex into a reusable runtime layer, enabling advanced workflows like multi-client sessions, conversation reattachment, and event-based streaming.

---

## ✨ Features

- 🧠 **Session Orchestration**
  - Manage multiple Codex sessions concurrently
  - Reattach clients to existing conversations
  - Conversation-level lifecycle control

- 🔄 **Real-time Streaming**
  - Assistant token streaming (`onAssistantDelta`)
  - Turn lifecycle events (`onTurnCompleted`, `onTurnDiff`)
  - Thread and status tracking

- 👥 **Multi-client Support**
  - Multiple clients can subscribe to the same session
  - Fan-out event system

- 🔐 **Approval Handling**
  - Built-in support for approval flows (`onApprovalRequest`)
  - External resolution via API

- ⚙️ **Process Management**
  - Spawn and manage Codex CLI processes
  - Graceful termination (per session / per conversation / global)

- 📦 **Extensible Architecture**
  - Designed to support multiple AI backends (Codex today, Ollama/Claude tomorrow)

---

## 🧱 Architecture

```
Client(s)
   ↓
CodexProcessManager
   ↓
Codex Session (CLI process)
   ↓
Event Stream (delta / status / approvals)
```

Core components:

- **CodexProcessManager**
  - Session registry
  - Client ↔ session mapping
  - Event fan-out system

- **Session Record**
  - Subscribers (clients)
  - Conversation binding
  - Logger + lifecycle hooks

- **Codex Session**
  - Underlying CLI process
  - Streaming + control interface

---

## 🚀 Getting Started

### Install

```bash
npm install
```

### Usage (example)

```js
const { CodexProcessManager } = require('./CodexProcessManager');

const manager = new CodexProcessManager({
  codexBin: 'codex',
  codexCwd: process.cwd(),
  logger: console
});

await manager.createSession('client-1', {
  onReady: console.log,
  onAssistantDelta: (d) => process.stdout.write(d.token),
  onTurnCompleted: console.log,
  onError: console.error
});

await manager.sendPrompt('client-1', 'Explain Linux scheduler in simple terms');
```

---

## 🔌 API Overview

### createSession(clientId, handlers, options)

Create or attach to a session.

Options:

- `cwd` → working directory
- `conversationId` → reuse existing conversation
- `multiAgentEnabled` → enable multi-agent mode

---

### sendPrompt(clientId, input)

Send input to the session.

---

### resolveApproval(clientId, requestId, action)

Resolve approval requests.

---

### detachClient(clientId)

Detach a client from a session.

---

### terminateSession(clientId)

Kill a specific session.

---

### terminateConversation(conversationId)

Kill all clients attached to a conversation.

---

### terminateAll()

Kill all running sessions.

---

## 🧠 Design Notes

cuescli is not just a wrapper around Codex.

It is designed as a **runtime layer for LLM-driven agents**, with:

- persistent sessions
- event-driven streaming
- pluggable backends (future)

The goal is to evolve towards a unified interface like:

```
Agent Runtime
 ├── Codex (CLI)
 ├── Ollama (HTTP)
 └── Claude (API)
```

---

## 🔮 Roadmap

- [ ] Adapter system (Codex / Ollama / Claude)
- [ ] Unified event model (`onToken`, `onMessage`, etc.)
- [ ] Built-in conversation memory layer
- [ ] Web dashboard (local)
- [ ] Multi-agent orchestration

---

## 🧪 Use Cases

- AI-powered developer CLI
- Multi-agent coding workflows
- Local + cloud hybrid AI systems
- Real-time AI dashboards
- Codex session multiplexing

---

## ⚠️ Limitations

- Currently tightly coupled to Codex CLI
- No built-in persistence layer (yet)
- Memory handled externally (Codex-side)

---

## 📄 License

MIT

---

## 🤝 Contributing

PRs are welcome.  
The project is evolving toward a full LLM runtime—architecture discussions are encouraged.