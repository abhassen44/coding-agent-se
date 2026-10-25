# Intelligent Coding Agent (ICA) — Progress Tracker

> Last updated: 2026-04-11

---

## Phased Delivery Plan — Status

| Phase | Name | Status | Details |
|-------|------|--------|---------|
| **Phase 1** | Foundation — Auth, User roles, Basic chat UI, Basic AI chat | ✅ Completed | JWT auth, login/register, role-based access, FastAPI + Next.js |
| **Phase 2** | Code Intelligence — Code generation, Explanation, Debugging, Markdown rendering | ✅ Completed | Gemini + Qwen AI, syntax-highlighted code blocks, multi-turn chat |
| **Phase 3** | File & RAG — File uploads, Repo indexing, Context-aware answers | ✅ Completed | GitHub import, Qdrant vector DB, RAG pipeline, file tree/code viewer |
| **Phase 4.0** | Snippet Runner (lightweight) | ✅ Completed | Quick code execution via Docker, `/execute` page, ▶ Run button in chat |
| **Phase 4A** | Sandbox Workspace — Container per project | ✅ Completed | Workspace model, WorkspaceService with Docker lifecycle + file API, 11 REST endpoints, Open Workspace button |
| **Phase 4B** | Web Code Editor — Monaco/VS Code in browser | ✅ Completed | Monaco editor, multi-tab editing, file tree, create/edit/save/delete |
| **Phase 4C** | Terminal & Commands — Shell inside sandbox | ✅ Completed | WebSocket terminal via Docker exec, xterm.js UI, toggle panel |
| **Phase 4D** | AI Agent in Sandbox — AI reads/writes/runs in workspace | ✅ Completed | Smart multi-provider routing, 16 workspace tools, live streaming edits, workspace chat panel |
| **Phase 5** | Admin Panel — User management, Logs & monitoring, System settings | ✅ Completed | User CRUD, activity logs, admin dashboard, JWT role guard |
| **Phase 6** | Agent Memory — Persistent context across sessions | 🔶 In Progress | Redis session buffer + Postgres conversations complete; Qdrant episodic memory pending |

## Additional Features
| Phase | Name | Status | Details |
|-------|------|---------|---------|
| **Phase 7** | Automation — Task definitions, Workflow execution, Scheduling | ❌ Not Started | Multi-step tasks, background execution, cron triggers |
| **Phase 4E** | Live Preview — See the app running | ✅ Completed | Port publishing, backend HTTP/WS reverse proxy, signed preview tokens, iframe preview |


---

## Current Position: 🎯 Phase 6 — Agent Memory

---

## Phase 4 Sub-phases (Bolt/Lovable-style Workspace)

### Phase 4.0 — Snippet Runner ✅ (already built)
- Run isolated code snippets in Docker (Python, JS, C++, Java)
- `/execute` page with editor, output panels, history
- ▶ Run button on code blocks in chat
- AI error diagnostics

### Phase 4A — Sandbox Workspace Foundation 🔶
- **Docker container per project** — persistent workspace from an imported repo
- **File system API** — list, read, write, create, delete files inside the container
- **Workspace lifecycle** — create, start, stop, destroy workspaces
- **Mount imported repo** into the container with read/write access

### Phase 4B — Web Code Editor
- **Monaco Editor** integration (VS Code in browser)
- **File tree** connected to the sandbox filesystem
- **Multi-tab editing** with syntax highlighting
- **Save** changes back to the sandbox container
- **Create/rename/delete** files and folders

### Phase 4C — Terminal & Command Execution
- **WebSocket-based terminal** connected to the sandbox shell
- **Run commands** — `npm install`, `pip install`, `build`, `test`, etc.
- **Live streaming output** via WebSocket
- **Process management** — start/stop/restart processes

### Phase 4D — AI Agent in Sandbox
- **AI reads workspace files** — understands the full project
- **AI writes/modifies files** — generates code changes directly
- **AI runs commands** — install deps, build, test
- **Accept/reject/edit flow** — user reviews AI changes before applying
- **Context-aware from RAG + live files**

### Phase 4E — Live Preview ✅
- **Port publishing** for 3000, 5000, 5173, 8000, 8080 (loopback by default)
- **Backend HTTP reverse proxy** with short-lived, path-scoped preview tokens
- **WebSocket proxying** for dev-server HMR
- **iframe preview** of the running app in the Workspace UI
- **Manual refresh** and open-in-new-window actions

### Phase 5 — Admin Panel ✅
- **Admin bootstrap** — set `ADMIN_EMAIL` + `ALLOW_ADMIN_BOOTSTRAP=true`, then register/login; disable after bootstrap
- **Activity logging** — `ActivityLog` model, `LogService` for USER_LOGIN, REPO_CREATED, AGENT_RUN, WORKSPACE_CREATED events
- **Admin service** — User list, ban/unban, role change, cascade delete, system stats (Docker containers)
- **Admin API** — 6 protected routes under `/api/v1/admin/*` guarded by `CurrentAdminUser`
- **Admin UI** — `/admin/users`, `/admin/stats`, `/admin/logs` with sidebar layout + JWT role guard
- **Dashboard integration** — Admin Panel button visible only to admin users

---

## Phase 6 — Agent Memory (3-Tier Architecture)

> Using existing infrastructure: Redis + PostgreSQL + Qdrant. Zero new dependencies.

### Phase 6.1 — Multi-Modal Context Extraction ✅
- **Inline Text Extraction** — Extracted contents from text/code files directly without DB storage bloat.
- **Rich Document Support** — Integrated `pypdf` (PDFs) and `python-docx` (Word Docs) for rich extraction.
- **Ollama Vision Integration** — Migrated image parsing to local `Ollama` using the `gemma4:31b-cloud` multimodal model instead of Gemini.
- **Frontend Context Injection** — Dynamically attaches extracted contents as a preamble into the active `ChatRequest`.

### Tier 1 — Hot Memory (Redis Session Buffer) ✅
- **Sliding window** of last 10-15 messages per active session
- **TTL: 2 hours** — auto-expires idle sessions
- **Use:** Injected into every LLM call for immediate conversational context
- **Covers:** Both RAG chat (`/chat`) and Workspace agent (`/workspace`)

### Tier 2 — Warm Memory (PostgreSQL Conversations) ✅
- **`conversations` table** — `id`, `user_id`, `workspace_id` (nullable), `title`, `created_at`
- **`chat_messages` table** — `id`, `conversation_id`, `role`, `content`, `metadata` (JSONB)
- **ConversationService** — CRUD for conversations + messages, history API loading.
- **JWT Auth Injection** — Accurate user tracking by extracting `user_id` from the Auth token header. 
- **Dynamic Sidebar UI** — "New Chat" idempotency, live event-driven `Recent Chats` list.
- **Chat Management** — Inline Rename mapping (`PATCH`) and conversation Deletion (`DELETE`).
- **One conversation per workspace** — agent remembers everything it did in that workspace

### Tier 3 — Cold Memory (Qdrant Episodic Memory)
- **Embed resolved conversations** as searchable episodes in Qdrant
- **Semantic retrieval** — "I solved something similar last week" recall
- **Auto-embed** successful agent sessions (file edits that weren't reverted)
- **Cross-workspace knowledge** — solutions from Workspace A inform Workspace B

### Advanced — Self-Built Memory Engine (Memori-style)
- **Custom implementation** — no third-party library, built on top of Tier 2 Postgres
- **Automatic context injection** — intercept LLM calls, inject relevant historical facts
- **User preference learning** — store patterns like "always uses TypeScript", "prefers functional style"
- **Agent personality persistence** — coding style, naming conventions, project-specific knowledge

---

## Completed Work Summary

### Phase 1 — Foundation ✅
- User registration, login, logout
- JWT-based authentication with token expiration & refresh
- Role-based access control (USER / ADMIN)
- Basic chat UI with Next.js + TailwindCSS
- FastAPI backend with REST APIs

### Phase 2 — Code Intelligence ✅
- AI-powered code generation (Gemini + Qwen models)
- Code explanation & debugging
- Markdown rendering with syntax-highlighted code blocks
- Multi-turn conversational context

### Phase 3 — File & RAG ✅
- File upload support
- GitHub repository import with real-time progress bar
- RAG pipeline: chunking → Gemini embeddings → Qdrant vector DB → top-K retrieval
- Context-aware AI answers using retrieved code chunks
- File tree browsing, code viewer, and context panel components
- Re-indexing support

### Phase 4.0 — Snippet Runner ✅
- Docker sandbox execution (Python, JS, C++, Java)
- `/execute` page with code editor, output panels, history sidebar
- ▶ Run button on chat code blocks with inline results
- AI error diagnostics via Gemini
- Resource limits (10s timeout, 256MB memory, 50% CPU)
