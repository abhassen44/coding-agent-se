const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
}

export interface ChatRequest {
    message: string;
    session_id?: string;
    history?: ChatMessage[];
    repository_id?: number;  // For RAG context injection
    context?: string;        // Pre-fetched context
}

export interface ChatResponse {
    message: string;
    session_id: string;
    context_used?: boolean;
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

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
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
        onError: (error: Error) => void
    ): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/chat/stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response body");
            }

            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                const lines = text.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") {
                            onComplete();
                            return;
                        }
                        onChunk(data);
                    }
                }
            }

            onComplete();
        } catch (error) {
            onError(error instanceof Error ? error : new Error(String(error)));
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
}

export const apiClient = new ApiClient();
