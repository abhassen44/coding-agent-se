const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export function getErrorMessage(error: unknown, fallback = "Something went wrong") {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
}

export interface ChatRequest {
    message: string;
    conversation_id?: number;
    session_id?: string;
    history?: ChatMessage[];
    repository_id?: number;  // For RAG context injection
    context?: string;        // Pre-fetched context
    provider?: "gemini" | "qwen" | "gemma4" | "hf-qwen-7b" | "hf-qwen-35b" | "hf-llama-8b" | "hf-llama-70b" | "gpt-oss-cloud" | "minimax-cloud" | "deepseek-cloud" | "nemotron-cloud";
}

export interface ChatResponse {
    message: string;
    session_id: string;
    conversation_id?: number;
    context_used?: boolean;
}

export interface ChatStreamMeta {
    conversationId: number | null;
    sessionId: string | null;
}

export interface CodeGenerateRequest {
    task: string;
    language: string;
    context?: string;
}

export interface CodeExplainRequest {
    code: string;
    language: string;
}

export interface CodeDebugRequest {
    code: string;
    error: string;
    language: string;
}

export interface CodeResponse {
    result: string;
    language: string;
}

// Execution Engine types
export interface ExecuteRequest {
    code: string;
    language: string;
    stdin?: string;
    timeout?: number;
}

export interface ExecuteResponse {
    id: number;
    language: string;
    status: string; // pending | running | success | error | timeout
    stdout?: string;
    stderr?: string;
    exit_code?: number;
    execution_time_ms?: number;
    memory_used_kb?: number;
    created_at: string;
}

export interface ExecutionHistoryResponse {
    executions: ExecuteResponse[];
    total: number;
}

export interface DiagnosticResponse {
    execution_id: number;
    diagnostic: string;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    private getAuthHeaders(): Record<string, string> {
        const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...this.getAuthHeaders(),
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `API error: ${response.status}`);
        }

        return response.json();
    }

    // Chat endpoints
    async sendMessage(request: ChatRequest): Promise<ChatResponse> {
        return this.request<ChatResponse>("/chat/message", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async streamMessage(
        request: ChatRequest,
        onChunk: (chunk: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void,
        onStart?: (meta: ChatStreamMeta) => void
    ): Promise<ChatStreamMeta> {
        let meta: ChatStreamMeta = { conversationId: null, sessionId: null };
        try {
            const response = await fetch(`${this.baseUrl}/chat/stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...this.getAuthHeaders(),
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || `API error: ${response.status}`);
            }

            meta = {
                conversationId: Number(response.headers.get("x-conversation-id")) || null,
                sessionId: response.headers.get("x-session-id"),
            };
            onStart?.(meta);

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response body");
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                let lineEnd = buffer.indexOf("\n");
                while (lineEnd >= 0) {
                    const line = buffer.slice(0, lineEnd).replace(/\r$/, "");
                    buffer = buffer.slice(lineEnd + 1);

                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") {
                            onComplete();
                            return meta;
                        }
                        onChunk(data);
                    }
                    lineEnd = buffer.indexOf("\n");
                }
            }

            if (buffer.startsWith("data: ")) {
                const data = buffer.slice(6);
                if (data !== "[DONE]") onChunk(data);
            }
            onComplete();
            return meta;
        } catch (error) {
            onError(error instanceof Error ? error : new Error(String(error)));
            return meta;
        }
    }

    // Code intelligence endpoints
    async generateCode(request: CodeGenerateRequest): Promise<CodeResponse> {
        return this.request<CodeResponse>("/chat/generate", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async explainCode(request: CodeExplainRequest): Promise<CodeResponse> {
        return this.request<CodeResponse>("/chat/explain", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async debugCode(request: CodeDebugRequest): Promise<CodeResponse> {
        return this.request<CodeResponse>("/chat/debug", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    // Execution Engine endpoints
    async executeCode(request: ExecuteRequest): Promise<ExecuteResponse> {
        return this.request<ExecuteResponse>("/execute/run", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async getExecutionHistory(limit: number = 20, offset: number = 0): Promise<ExecutionHistoryResponse> {
        return this.request<ExecutionHistoryResponse>(`/execute/history?limit=${limit}&offset=${offset}`);
    }

    async getExecution(id: number): Promise<ExecuteResponse> {
        return this.request<ExecuteResponse>(`/execute/${id}`);
    }

    async diagnoseExecution(id: number): Promise<DiagnosticResponse> {
        return this.request<DiagnosticResponse>(`/execute/${id}/diagnose`, {
            method: "POST",
        });
    }

    // Workspace endpoints
    async createWorkspace(request: WorkspaceCreateRequest): Promise<WorkspaceResponse> {
        return this.request<WorkspaceResponse>("/workspace/create", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async listWorkspaces(limit: number = 20, offset: number = 0): Promise<WorkspaceListResponse> {
        return this.request<WorkspaceListResponse>(`/workspace?limit=${limit}&offset=${offset}`);
    }

    async getWorkspace(id: number): Promise<WorkspaceResponse> {
        return this.request<WorkspaceResponse>(`/workspace/${id}`);
    }

    async startWorkspace(id: number): Promise<WorkspaceResponse> {
        return this.request<WorkspaceResponse>(`/workspace/${id}/start`, { method: "POST" });
    }

    async stopWorkspace(id: number): Promise<WorkspaceResponse> {
        return this.request<WorkspaceResponse>(`/workspace/${id}/stop`, { method: "POST" });
    }

    async destroyWorkspace(id: number): Promise<void> {
        await this.request(`/workspace/${id}`, { method: "DELETE" });
    }

    async listWorkspaceFiles(id: number, path: string = "."): Promise<FileTreeResponse> {
        return this.request<FileTreeResponse>(`/workspace/${id}/files?path=${encodeURIComponent(path)}`);
    }

    async createTerminalTicket(id: number): Promise<{ ticket: string; expires_in: number }> {
        return this.request<{ ticket: string; expires_in: number }>(`/terminal/${id}/ticket`, {
            method: "POST",
        });
    }

    async readWorkspaceFile(id: number, path: string): Promise<FileContentResponse> {
        return this.request<FileContentResponse>(`/workspace/${id}/files/read?path=${encodeURIComponent(path)}`);
    }

    async writeWorkspaceFile(id: number, path: string, content: string): Promise<void> {
        await this.request(`/workspace/${id}/files/write`, {
            method: "POST",
            body: JSON.stringify({ path, content }),
        });
    }

    async createWorkspaceFile(id: number, path: string, isDirectory: boolean = false, content: string = ""): Promise<void> {
        await this.request(`/workspace/${id}/files/create`, {
            method: "POST",
            body: JSON.stringify({ path, is_directory: isDirectory, content }),
        });
    }

    async deleteWorkspaceFile(id: number, path: string): Promise<void> {
        await this.request(`/workspace/${id}/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
    }

    async getWorkspacePreviewToken(id: number, port: number): Promise<PreviewTokenResponse> {
        return this.request<PreviewTokenResponse>(`/workspace/${id}/preview-token`, {
            method: "POST",
            body: JSON.stringify({ port }),
        });
    }

    async listRepositories(): Promise<RepositoryListResponse> {
        return this.request<RepositoryListResponse>("/repo");
    }

    // Agent endpoints (Phase 4D)
    async agentAct(request: AgentRequest): Promise<AgentResponse> {
        return this.request<AgentResponse>("/agent/act", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async agentApply(workspaceId: number, actions: AgentAction[]): Promise<AgentApplyResponse> {
        return this.request<AgentApplyResponse>("/agent/apply", {
            method: "POST",
            body: JSON.stringify({ workspace_id: workspaceId, actions }),
        });
    }

    // Agent SSE streaming (Phase 4D+)
    agentStream(
        request: AgentRequest,
        onEvent: (event: AgentStreamEvent) => void,
        onError: (error: Error) => void,
        onComplete: () => void,
    ): AbortController {
        const controller = new AbortController();

        (async () => {
            try {
                const response = await fetch(`${this.baseUrl}/agent/stream`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...this.getAuthHeaders() },
                    body: JSON.stringify(request),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.detail || `API error: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error("No response body");

                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    // Keep the last potentially incomplete line in the buffer
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            try {
                                const event = JSON.parse(line.slice(6)) as AgentStreamEvent;
                                onEvent(event);
                            } catch {
                                // Skip malformed JSON lines
                            }
                        }
                    }
                }

                // Process remaining buffer
                if (buffer.startsWith("data: ")) {
                    try {
                        const event = JSON.parse(buffer.slice(6)) as AgentStreamEvent;
                        onEvent(event);
                    } catch { /* skip */ }
                }

                onComplete();
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    onError(error instanceof Error ? error : new Error(String(error)));
                }
            }
        })();

        return controller;
    }

    // ── Admin endpoints (Phase 5) ──────────────────────────────────────────

    async getAdminUsers(params: { search?: string; page?: number; limit?: number } = {}): Promise<AdminUserListResponse> {
        const q = new URLSearchParams();
        if (params.search) q.set("search", params.search);
        if (params.page) q.set("page", String(params.page));
        if (params.limit) q.set("limit", String(params.limit));
        return this.request<AdminUserListResponse>(`/admin/users?${q}`);
    }

    async banUser(userId: number, ban: boolean): Promise<AdminUser> {
        return this.request<AdminUser>(`/admin/users/${userId}/ban`, {
            method: "PATCH",
            body: JSON.stringify({ ban }),
        });
    }

    async changeUserRole(userId: number, role: string): Promise<AdminUser> {
        return this.request<AdminUser>(`/admin/users/${userId}/role`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
        });
    }

    async deleteAdminUser(userId: number): Promise<{ message: string }> {
        return this.request<{ message: string }>(`/admin/users/${userId}`, { method: "DELETE" });
    }

    async getAdminStats(): Promise<AdminStatsResponse> {
        return this.request<AdminStatsResponse>("/admin/stats");
    }

    async getAdminLogs(params: { user_id?: number; action?: string; page?: number; limit?: number } = {}): Promise<AdminLogListResponse> {
        const q = new URLSearchParams();
        if (params.user_id) q.set("user_id", String(params.user_id));
        if (params.action) q.set("action", params.action);
        if (params.page) q.set("page", String(params.page));
        if (params.limit) q.set("limit", String(params.limit));
        return this.request<AdminLogListResponse>(`/admin/logs?${q}`);
    }

    // ── Conversation Memory endpoints (Phase 6) ──────────────────────────

    async listConversations(workspaceId?: number): Promise<ConversationListResponse> {
        const q = new URLSearchParams();
        if (workspaceId != null) q.set("workspace_id", String(workspaceId));
        return this.request<ConversationListResponse>(`/conversations?${q}`);
    }

    async getConversationMessages(conversationId: number, limit: number = 50): Promise<MessageListResponse> {
        return this.request<MessageListResponse>(`/conversations/${conversationId}/messages?limit=${limit}`);
    }

    async deleteConversation(conversationId: number): Promise<{ status: string }> {
        return this.request<{ status: string }>(`/conversations/${conversationId}`, { method: "DELETE" });
    }

    async renameConversation(conversationId: number, title: string): Promise<{ status: string; title: string }> {
        return this.request<{ status: string; title: string }>(`/conversations/${conversationId}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
        });
    }

    // ── File extraction (Phase 6 — attachment context) ───────────────────

    async extractFileText(file: File): Promise<{ filename: string; file_type: string; text: string; char_count: number; truncated: boolean }> {
        const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`${this.baseUrl}/files/extract-text`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Extraction failed: ${response.status}`);
        }
        return response.json();
    }
}

export const apiClient = new ApiClient();

// Workspace types
export interface WorkspaceCreateRequest {
    repo_id?: number;
    repo_url?: string;
    name?: string;
}

export interface WorkspaceResponse {
    id: number;
    name: string;
    status: string;
    repo_id?: number;
    repo_url?: string;
    base_image: string;
    work_dir: string;
    created_at: string;
    last_accessed_at?: string;
    error_message?: string;
    ports?: Record<string, number>;
}

export interface WorkspaceListResponse {
    workspaces: WorkspaceResponse[];
    total: number;
}

export interface PreviewTokenResponse {
    token: string;
    expires_in: number;
}

export interface RepositorySummary {
    id: number;
    name: string;
}

export interface RepositoryListResponse {
    repositories: RepositorySummary[];
    total: number;
}

export interface FileNode {
    name: string;
    path: string;
    type: "file" | "dir";
    size?: number;
}

export interface FileTreeResponse {
    path: string;
    entries: FileNode[];
}

export interface FileContentResponse {
    path: string;
    content: string;
    language?: string;
}

// Agent types (Phase 4D)
export interface AgentAction {
    type: "file_edit" | "file_create" | "file_delete" | "run_command";
    path?: string;
    content?: string;
    command?: string;
    description: string;
}

export type AgentProvider =
    | "auto"
    | "gemini"
    | "qwen"
    | "gemma4"
    | "hf-qwen-7b"
    | "hf-qwen-35b"
    | "hf-llama-8b"
    | "hf-llama-70b"
    | "gpt-oss-cloud"
    | "minimax-cloud"
    | "deepseek-cloud"
    | "nemotron-cloud";

export interface AgentRequest {
    workspace_id: number;
    prompt: string;
    conversation_id?: number;
    file_paths?: string[];
    provider?: AgentProvider;
}

export interface AgentResponse {
    explanation: string;
    actions: AgentAction[];
    model_used: string;
    context_tokens_approx: number;
}

export interface AgentApplyResult {
    action: AgentAction;
    success: boolean;
    output?: string;
    error?: string;
}

export interface AgentApplyResponse {
    results: AgentApplyResult[];
    all_succeeded: boolean;
}

// Agent SSE stream event types (Phase 4D+)
export type AgentStreamEvent =
    | { type: "status"; status: string; model?: string }
    | { type: "token"; content: string }
    | { type: "tool_start"; name: string; args: Record<string, unknown> }
    | { type: "tool_result"; name: string; output: string }
    | { type: "done"; model_used: string; context_tokens_approx: number; actions: AgentAction[]; conversation_id?: number }
    | { type: "error"; message: string };

// ── Admin Panel types (Phase 5) ────────────────────────────────────────────

export interface AdminUser {
    id: number;
    email: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
    created_at: string;
}

export interface AdminUserListResponse {
    users: AdminUser[];
    total: number;
    page: number;
    limit: number;
}

export interface AdminStatsResponse {
    total_users: number;
    active_users: number;
    total_repos: number;
    total_workspaces: number;
    active_containers: number;
}

export interface AdminLogItem {
    id: number;
    user_id: number | null;
    user_email: string | null;
    action: string;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface AdminLogListResponse {
    logs: AdminLogItem[];
    total: number;
    page: number;
    limit: number;
}

// ── Conversation Memory types (Phase 6) ────────────────────────────────────

export interface ConversationListItem {
    id: number;
    title: string | null;
    workspace_id: number | null;
    created_at: string;
    updated_at: string;
}

export interface ConversationMessage {
    id: number;
    role: string;
    content: string;
    metadata_json: Record<string, unknown> | null;
    created_at: string;
}

export interface ConversationListResponse {
    conversations: ConversationListItem[];
}

export interface MessageListResponse {
    messages: ConversationMessage[];
    conversation_id: number;
}

