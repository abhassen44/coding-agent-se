"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import MessageBubble from "./MessageBubble";
import { apiClient, ChatMessage as ApiChatMessage, ConversationMessage } from "@/lib/api";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

interface Repository {
    id: number;
    name: string;
    description?: string;
    file_count: number;
}

interface AttachedFile {
    name: string;
    fileType: string;
    text: string;
    charCount: number;
    truncated: boolean;
    status: "extracting" | "ready" | "error";
    error?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const INITIAL_MESSAGES: Message[] = [
    {
        id: "welcome",
        role: "assistant",
        content: "👋 Hello! I'm your **Intelligent Coding Agent**. I can help you with:\n\n- 💡 Answering coding questions\n- 🔧 Generating code in multiple languages\n- 🐛 Debugging errors\n- 📁 Analyzing your repositories\n\nHow can I help you today?",
        timestamp: new Date(),
    },
];

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const isLoadingRef = useRef(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
    const useStreaming = false;
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
    const [showRepoDropdown, setShowRepoDropdown] = useState(false);
    const [planMode, setPlanMode] = useState(false);
    const [provider, setProvider] = useState<"gemini" | "qwen" | "qwen-cloud" | "gemma4" | "gpt-oss-cloud" | "kimi-cloud" | "minimax-cloud">("qwen-cloud");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchParams = useSearchParams();
    const router = useRouter();

    const getToken = () => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("auth_token");
        }
        return null;
    };

    /** Persist the session to localStorage for the Recent sidebar section */
    const saveRecentChat = (id: string, title: string) => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem("recent_chats");
            const existing: { id: string; title: string; timestamp: number }[] = raw ? JSON.parse(raw) : [];
            const filtered = existing.filter((c) => c.id !== id);
            filtered.unshift({ id, title, timestamp: Date.now() });
            localStorage.setItem("recent_chats", JSON.stringify(filtered.slice(0, 20)));
            window.dispatchEvent(new StorageEvent("storage", { key: "recent_chats" }));
        } catch {
            // ignore
        }
    };

    // ── Session management: load history or reset for new chat ──
    useEffect(() => {
        const newParam = searchParams.get("new");
        const sessionParam = searchParams.get("session");

        // "New Chat" clicked — always flush all state
        if (newParam) {
            setMessages(INITIAL_MESSAGES);
            setSessionId(null);
            setConversationId(null);
            setAttachedFiles([]);
            setStreamingContent("");
            setInput("");
            return;
        }

        // Load existing conversation
        if (!sessionParam) return;
        const convId = parseInt(sessionParam, 10);
        if (isNaN(convId)) return;

        let cancelled = false;
        (async () => {
            try {
                const res = await apiClient.getConversationMessages(convId, 50);
                if (cancelled) return;
                const loaded: Message[] = res.messages
                    .filter((m: ConversationMessage) => m.role !== "tool_summary")
                    .map((m: ConversationMessage) => ({
                        id: String(m.id),
                        role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
                        content: m.content,
                        timestamp: new Date(m.created_at),
                    }));
                if (loaded.length > 0) {
                    setMessages(loaded);
                    setConversationId(convId);
                }
            } catch (err) {
                console.warn("Failed to load conversation history:", err);
            }
        })();
        return () => { cancelled = true; };
    }, [searchParams]);

    // Fetch user repositories
    useEffect(() => {
        const fetchRepos = async () => {
            const token = getToken();
            if (!token) return;
            try {
                const response = await fetch(`${API_BASE}/repo`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (response.ok) {
                    const data = await response.json();
                    setRepositories(data.repositories || []);
                }
            } catch (err) {
                console.error("Failed to fetch repositories:", err);
            }
        };
        fetchRepos();
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent]);

    // Auto-submit query from global search bar (?q=...)
    useEffect(() => {
        const q = searchParams.get("q");
        if (!q) return;
        router.replace("/chat", { scroll: false });
        setInput(q);
        const timeoutId = setTimeout(() => {
            if (isLoadingRef.current) return;
            const userMessage: Message = {
                id: Date.now().toString(),
                role: "user",
                content: q,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, userMessage]);
            setInput("");
            setIsLoading(true);
            isLoadingRef.current = true;
            setStreamingContent("");
            const history: ApiChatMessage[] = INITIAL_MESSAGES.slice(-10).map(msg => ({
                role: msg.role,
                content: msg.content,
            }));
            apiClient.sendMessage({ message: q, session_id: undefined, history, repository_id: undefined, provider: "gemini" })
                .then(response => {
                    const aiMessage: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: response.message, timestamp: new Date() };
                    setMessages(prev => [...prev, aiMessage]);
                    setSessionId(response.session_id);
                })
                .catch(err => {
                    const errMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: `⚠️ Error: ${err?.message || "Unknown error"}`, timestamp: new Date() };
                    setMessages(prev => [...prev, errMsg]);
                })
                .finally(() => {
                    setIsLoading(false);
                    isLoadingRef.current = false;
                    setStreamingContent("");
                });
        }, 100);
        return () => clearTimeout(timeoutId);
    }, [router, searchParams]);

    // ── Bug 2 Fix: Extract file text instead of uploading to DB ──
    const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        if (e.target) e.target.value = "";

        for (const file of files) {
            const placeholder: AttachedFile = {
                name: file.name,
                fileType: "unknown",
                text: "",
                charCount: 0,
                truncated: false,
                status: "extracting",
            };
            setAttachedFiles(prev => [...prev, placeholder]);

            try {
                const result = await apiClient.extractFileText(file);
                setAttachedFiles(prev => prev.map(f =>
                    f.name === file.name && f.status === "extracting"
                        ? { ...f, ...result, status: "ready" as const }
                        : f
                ));
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Extraction failed";
                setAttachedFiles(prev => prev.map(f =>
                    f.name === file.name && f.status === "extracting"
                        ? { ...f, status: "error" as const, error: msg }
                        : f
                ));
            }
        }
    };

    const removeAttachedFile = (name: string) => {
        setAttachedFiles(prev => prev.filter(f => f.name !== name));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoadingRef.current) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        const currentInput = input.trim();
        setInput("");
        setIsLoading(true);
        isLoadingRef.current = true;
        setStreamingContent("");

        const history: ApiChatMessage[] = messages.slice(-10).map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));

        try {
            if (useStreaming) {
                let fullContent = "";
                await apiClient.streamMessage(
                    { message: currentInput, conversation_id: conversationId || undefined, session_id: sessionId || undefined, history, repository_id: selectedRepoId || undefined, provider },
                    (chunk) => { fullContent += chunk; setStreamingContent(fullContent); },
                    () => {
                        const aiMessage: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: fullContent, timestamp: new Date() };
                        setMessages((prev) => [...prev, aiMessage]);
                        setStreamingContent("");
                        setIsLoading(false);
                        isLoadingRef.current = false;
                    },
                    (error) => { console.error("Streaming error:", error); handleNonStreamingResponse(currentInput, history); }
                );
            } else {
                await handleNonStreamingResponse(currentInput, history);
            }
        } catch (error) {
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: `⚠️ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    const handleNonStreamingResponse = async (message: string, history: ApiChatMessage[]) => {
        try {
            // Build inline context from attached files
            const readyFiles = attachedFiles.filter(f => f.status === "ready");
            let fileContext: string | undefined;
            if (readyFiles.length > 0) {
                fileContext = readyFiles.map(f => {
                    const typeLabel =
                        f.fileType === "pdf" ? "📄 PDF" :
                            f.fileType === "word" ? "📝 Word Doc" :
                                f.fileType === "image" ? "🖼️ Image" : "📄 File";
                    return `=== Attached ${typeLabel}: ${f.name} ===\n${f.text}\n=== End of ${f.name} ===`;
                }).join("\n\n");
            }

            const response = await apiClient.sendMessage({
                message,
                conversation_id: conversationId || undefined,
                session_id: sessionId || undefined,
                history,
                repository_id: selectedRepoId || undefined,
                provider,
                context: fileContext,
            });
            setSessionId(response.session_id);
            if (response.conversation_id) {
                setConversationId(response.conversation_id);
            }
            // Clear ready files after successful send
            if (readyFiles.length > 0) {
                setAttachedFiles([]);
            }
            // Save to recent chats on the very first exchange
            if (!sessionId && response.session_id) {
                const title = message.slice(0, 40) + (message.length > 40 ? "..." : "");
                saveRecentChat(response.session_id, title);
                // Notify sidebar to refresh its list
                window.dispatchEvent(new CustomEvent("conversation-updated"));
            }
            const aiMessage: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: response.message, timestamp: new Date() };
            setMessages((prev) => [...prev, aiMessage]);
        } catch (error) {
            throw error;
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const selectedRepo = repositories.find(r => r.id === selectedRepoId);

    return (
        <div className="flex flex-col h-full bg-[#0B0F0E]">
            {/* Context Bar */}
            <div className="border-b border-[#1F2D28] px-4 py-3 bg-[#111917]">
                <div className="flex items-center gap-3">
                    <span className="text-[#5A7268] text-sm">Context:</span>

                    {/* Repository Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowRepoDropdown(!showRepoDropdown)}
                            className="flex items-center gap-2 px-3 py-2 bg-[#1A2420] border border-[#1F2D28] rounded-xl text-sm hover:border-[#2EFF7B]/50 transition-colors min-w-[180px]"
                        >
                            <svg className="w-4 h-4 text-[#2EFF7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <span className="flex-1 text-left text-[#E6F1EC] truncate">
                                {selectedRepo ? selectedRepo.name : "No repository"}
                            </span>
                            <svg className={`w-4 h-4 text-[#5A7268] transition-transform ${showRepoDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {showRepoDropdown && (
                            <div className="absolute top-full left-0 mt-2 w-64 bg-[#111917] border border-[#1F2D28] rounded-xl shadow-xl z-50 overflow-hidden">
                                <button
                                    onClick={() => { setSelectedRepoId(null); setShowRepoDropdown(false); }}
                                    className={`w-full px-3 py-2.5 text-left text-sm hover:bg-[#1A2420] transition-colors ${!selectedRepoId ? "bg-[#2EFF7B]/10 text-[#2EFF7B]" : "text-[#8FAEA2]"}`}
                                >
                                    No repository (general chat)
                                </button>
                                {repositories.map((repo) => (
                                    <button
                                        key={repo.id}
                                        onClick={() => { setSelectedRepoId(repo.id); setShowRepoDropdown(false); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[#1A2420] transition-colors ${selectedRepoId === repo.id ? "bg-[#2EFF7B]/10 text-[#2EFF7B]" : "text-[#8FAEA2]"}`}
                                    >
                                        <span className="truncate">{repo.name}</span>
                                        <span className="text-xs text-[#5A7268]">({repo.file_count})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {selectedRepoId && (
                        <span className="text-[#2EFF7B] text-xs bg-[#2EFF7B]/10 px-2 py-1 rounded-lg border border-[#2EFF7B]/30">
                            ✓ RAG enabled
                        </span>
                    )}

                    {/* AI Provider Dropdown */}
                    <div className="relative">
                        <select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as typeof provider)}
                            className={`appearance-none cursor-pointer px-3 py-1.5 pr-7 rounded-lg text-xs font-medium transition-all duration-200 border focus:outline-none ${provider === "gemini"
                                    ? "bg-[#2EFF7B]/10 text-[#2EFF7B] border-[#2EFF7B]/30 hover:bg-[#2EFF7B]/20"
                                    : provider === "gemma4"
                                        ? "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
                                        : provider.endsWith("-cloud")
                                            ? "bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20"
                                            : "bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20"
                                }`}
                            aria-label="AI model"
                        >
                            <option value="gemini">✦ Gemini</option>
                            <option value="gemma4">◆ Gemma 4 (Local)</option>
                            <option value="qwen">■ Qwen 3.5 (Local)</option>
                            <option value="qwen-cloud">☁ Qwen 397B (Cloud)</option>
                            <option value="gpt-oss-cloud">☁ GPT-OSS 120B (Cloud)</option>
                            <option value="kimi-cloud">☁ Kimi k2.5 (Cloud)</option>
                            <option value="minimax-cloud">☁ MiniMax m2.7 (Cloud)</option>
                        </select>
                        <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#5A7268]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                ))}

                {streamingContent && (
                    <MessageBubble message={{ id: "streaming", role: "assistant", content: streamingContent, timestamp: new Date() }} />
                )}

                {isLoading && !streamingContent && (
                    <div className="flex gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#1A2420] border border-[#1F2D28] flex items-center justify-center">
                            <svg className="w-4 h-4 text-[#2EFF7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div className="bg-[#111917] border border-[#1F2D28] rounded-2xl rounded-tl-md px-4 py-3">
                            <div className="flex gap-1.5">
                                <span className="w-2 h-2 bg-[#2EFF7B] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                <span className="w-2 h-2 bg-[#2EFF7B] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                <span className="w-2 h-2 bg-[#2EFF7B] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input — Antigravity-style bottom bar */}
            <div className="shrink-0 border-t border-[#1F2D28] bg-[#111917]">
                <form onSubmit={handleSubmit} className="flex flex-col">
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileAttach}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.bmp,.txt,.md,.py,.js,.ts,.tsx,.jsx,.java,.cpp,.c,.go,.rs,.json,.yaml,.yml,.sql,.sh,.csv,.xml,.html,.css"
                    />

                    {/* Attached files row */}
                    {attachedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
                            {attachedFiles.map((file, idx) => (
                                <span
                                    key={idx}
                                    title={file.error || (file.status === "ready" ? `${file.charCount.toLocaleString()} chars extracted${file.truncated ? " (truncated)" : ""}` : "")}
                                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${file.status === "ready"
                                            ? "bg-[#2EFF7B]/10 text-[#2EFF7B] border-[#2EFF7B]/30"
                                            : file.status === "error"
                                                ? "bg-red-500/10 text-red-400 border-red-500/30"
                                                : "bg-[#111917] text-[#8FAEA2] border-[#1F2D28] animate-pulse"
                                        }`}
                                >
                                    {file.status === "extracting" ? "⏳" : file.status === "ready" ? (
                                        file.fileType === "pdf" ? "📄" :
                                            file.fileType === "word" ? "📝" :
                                                file.fileType === "image" ? "🖼️" : "📄"
                                    ) : "✕"}
                                    <span className="max-w-[120px] truncate">{file.name}</span>
                                    {file.status !== "extracting" && (
                                        <button
                                            type="button"
                                            onClick={() => removeAttachedFile(file.name)}
                                            className="ml-1 opacity-60 hover:opacity-100 mt-0.5"
                                        >×</button>
                                    )}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Textarea — auto-growing, flat */}
                    <div className="px-4 pt-3 pb-1">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                const el = e.target;
                                el.style.height = 'auto';
                                el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    const formEvent = e as unknown as React.FormEvent;
                                    handleSubmit(formEvent);
                                    if (inputRef.current) {
                                        inputRef.current.style.height = 'auto';
                                    }
                                }
                            }}
                            placeholder="Ask me anything about code..."
                            rows={1}
                            className="w-full bg-transparent border-none px-1 py-2 text-sm text-[#E6F1EC] placeholder-[#5A7268] focus:outline-none focus:ring-0 resize-none overflow-y-auto"
                            style={{ maxHeight: '200px', outline: 'none', boxShadow: 'none' }}
                        />
                    </div>

                    {/* Controls row — below input */}
                    <div className="flex items-center gap-2 px-4 py-2.5">
                        {/* + Attach button */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5A7268] hover:bg-[#1A2420] hover:text-[#8FAEA2] transition-colors"
                            aria-label="Add attachment"
                            title="Attachments"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>

                        {/* Plan mode toggle */}
                        <label className="flex items-center gap-2 cursor-pointer group ml-1">
                            <div className="relative flex items-center">
                                <input type="checkbox" className="sr-only" checked={planMode} onChange={(e) => setPlanMode(e.target.checked)} />
                                <div className={`block w-8 h-4 rounded-full transition-colors ${planMode ? "bg-[#2EFF7B]/20" : "bg-[#1A2420] border border-[#244235]"}`}></div>
                                <div className={`absolute left-0.5 top-0.5 w-3 h-3 rounded-full transition-transform ${planMode ? "translate-x-4 bg-[#2EFF7B]" : "bg-[#5A7268] group-hover:bg-[#8FAEA2]"}`}></div>
                            </div>
                            <span className={`text-[11px] font-medium transition-colors ${planMode ? "text-[#2EFF7B]" : "text-[#5A7268] group-hover:text-[#8FAEA2]"}`}>Plan</span>
                        </label>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Expand Button */}
                        <button
                            type="button"
                            className="p-1.5 text-[#5A7268] hover:text-[#8FAEA2] hover:bg-[#1A2420] rounded-lg transition-colors ml-1"
                            aria-label="Expand"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
                            </svg>
                        </button>

                        {/* Send Button — Circular */}
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading || attachedFiles.some(f => f.status === "extracting")}
                            className="flex h-9 w-9 items-center justify-center bg-[#2EFF7B] text-[#0B0F0E] rounded-full hover:bg-[#1ED760] disabled:opacity-40 disabled:bg-[#1A2420] disabled:text-[#5A7268] transition-all ml-1"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                            </svg>
                        </button>
                    </div>
                </form>
                <div className="text-center pb-2 pointer-events-auto">
                    <span className="text-[10px] text-[#5A7268]">ICA may produce inaccurate information.</span>
                </div>
            </div>
        </div>
    );
}
