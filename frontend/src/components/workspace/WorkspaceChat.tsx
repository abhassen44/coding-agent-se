'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
    AgentAction,
    AgentProvider,
    AgentStreamEvent,
    apiClient,
    ConversationListItem,
    ConversationMessage,
} from '@/lib/api';
import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    Cpu,
    Loader2,
    Plus,
    Sparkles,
    Square,
    Trash2,
    Wrench,
    XCircle,
} from 'lucide-react';

interface ToolCallCard {
    name: string;
    args: Record<string, unknown>;
    status: 'running' | 'done' | 'error';
    output?: string;
}

interface AttachedFile {
    name: string;
    fileType: string;
    text: string;
    charCount: number;
    truncated: boolean;
    status: 'extracting' | 'ready' | 'error';
    error?: string;
}

interface ChatMessage {
    role: 'user' | 'agent';
    content: string;
    actions?: AgentAction[];
    modelUsed?: string;
    tokensApprox?: number;
    toolCalls?: ToolCallCard[];
}

interface WorkspaceChatProps {
    workspaceId: number;
    isVisible: boolean;
    activeFilePath?: string | null;
    openFilePaths?: string[];
    onFileChanged?: (
        changedPaths?: string[],
        options?: { refreshOpenEditors?: boolean }
    ) => void | Promise<void>;
}

const PROVIDER_OPTIONS: Array<{ value: AgentProvider; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'qwen', label: 'Qwen 3.5 (Local)' },
    { value: 'qwen-cloud', label: 'Qwen 397B (Cloud)' },
    { value: 'gemma4', label: 'Gemma 4 (Local)' },
    { value: 'gpt-oss-cloud', label: 'GPT-OSS 120B (Cloud)' },
    { value: 'kimi-cloud', label: 'Kimi k2.5 (Cloud)' },
    { value: 'minimax-cloud', label: 'MiniMax m2.7 (Cloud)' },
    { value: 'hf-qwen-7b', label: 'HF Qwen 7B' },
    { value: 'hf-qwen-35b', label: 'HF Qwen 35B' },
    { value: 'hf-llama-8b', label: 'HF Llama 8B' },
    { value: 'hf-llama-70b', label: 'HF Llama 70B' },
];

export const WorkspaceChat: React.FC<WorkspaceChatProps> = ({
    workspaceId,
    isVisible,
    activeFilePath,
    openFilePaths = [],
    onFileChanged,
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [streamingTools, setStreamingTools] = useState<ToolCallCard[]>([]);
    const [streamingModel, setStreamingModel] = useState('');
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [conversations, setConversations] = useState<ConversationListItem[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

    const [provider, setProvider] = useState<AgentProvider>('qwen-cloud');
    const isStreamingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const streamingContentRef = useRef('');
    const streamingToolsRef = useRef<ToolCallCard[]>([]);
    const onFileChangedRef = useRef(onFileChanged);
    onFileChangedRef.current = onFileChanged;
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const historyPanelRef = useRef<HTMLDivElement>(null);
    const historyButtonRef = useRef<HTMLButtonElement>(null);

    const clearStreamingState = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setStreamingContent('');
        streamingContentRef.current = '';
        setStreamingTools([]);
        streamingToolsRef.current = [];
        setStreamingModel('');
        setIsStreaming(false);
        isStreamingRef.current = false;
    }, []);

    const mapConversationMessages = useCallback((conversationMessages: ConversationMessage[]): ChatMessage[] => (
        conversationMessages
            .filter((message: ConversationMessage) => message.role !== 'tool_summary')
            .map((message: ConversationMessage) => ({
                role: message.role === 'user' ? 'user' as const : 'agent' as const,
                content: message.content,
                toolCalls: message.metadata_json?.tool_name ? [{
                    name: message.metadata_json.tool_name as string,
                    args: {},
                    status: 'done' as const,
                    output: (message.metadata_json.full_output as string) || '',
                }] : undefined,
            }))
    ), []);

    const refreshConversations = useCallback(async () => {
        setIsHistoryLoading(true);
        setHistoryError(null);
        try {
            const res = await apiClient.listConversations(workspaceId);
            setConversations(res.conversations);
            return res.conversations;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load conversations';
            setHistoryError(message);
            throw error;
        } finally {
            setIsHistoryLoading(false);
        }
    }, [workspaceId]);

    const loadConversation = useCallback(async (nextConversationId: number) => {
        clearStreamingState();
        const msgRes = await apiClient.getConversationMessages(nextConversationId, 50);
        const loaded = mapConversationMessages(msgRes.messages);
        setMessages(loaded);
        setConversationId(nextConversationId);
        setShowHistory(false);
    }, [clearStreamingState, mapConversationMessages]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await refreshConversations();
                if (cancelled) return;
                if (res.length > 0) {
                    const latestConversation = res[0];
                    const msgRes = await apiClient.getConversationMessages(latestConversation.id, 50);
                    if (cancelled) return;
                    setMessages(mapConversationMessages(msgRes.messages));
                    setConversationId(latestConversation.id);
                } else {
                    setMessages([]);
                    setConversationId(null);
                }
            } catch (err) {
                console.warn('Failed to load conversation history:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [mapConversationMessages, refreshConversations, workspaceId]);

    const contextFilePaths = (() => {
        const paths = [activeFilePath, ...openFilePaths].filter(
            (path): path is string => Boolean(path)
        );
        const unique = Array.from(new Set(paths));
        return unique.length > 0 ? unique.slice(0, 8) : undefined;
    })();

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent, streamingTools]);

    useEffect(() => {
        if (isVisible) {
            inputRef.current?.focus();
        }
    }, [isVisible]);

    const handleStop = useCallback(() => {
        const content = streamingContentRef.current;
        const tools = streamingToolsRef.current;
        if (content || tools.length > 0) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'agent',
                    content: content || '(Generation stopped)',
                    toolCalls: tools.length > 0 ? tools : undefined,
                },
            ]);
        }
        clearStreamingState();
    }, [clearStreamingState]);

    const handleSend = useCallback(async () => {
        const prompt = input.trim();
        if (!prompt || isStreamingRef.current || attachedFiles.some((file) => file.status === 'extracting')) return;

        const readyFiles = attachedFiles.filter((file) => file.status === 'ready');
        const promptWithAttachments = readyFiles.length > 0
            ? `${prompt}\n\nAttached file context:\n${readyFiles.map((file) => {
                const typeLabel =
                    file.fileType === 'pdf' ? 'PDF' :
                        file.fileType === 'word' ? 'Word Doc' :
                            file.fileType === 'image' ? 'Image' : 'File';
                return `=== Attached ${typeLabel}: ${file.name} ===\n${file.text}\n=== End of ${file.name} ===`;
            }).join('\n\n')}`
            : prompt;

        setInput('');
        setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
        setIsStreaming(true);
        isStreamingRef.current = true;
        setStreamingContent('');
        streamingContentRef.current = '';
        setStreamingTools([]);
        streamingToolsRef.current = [];
        setStreamingModel('');

        const controller = apiClient.agentStream(
            {
                workspace_id: workspaceId,
                prompt: promptWithAttachments,
                conversation_id: conversationId ?? undefined,
                file_paths: contextFilePaths,
                provider,
            },
            (event: AgentStreamEvent) => {
                switch (event.type) {
                    case 'status':
                        setStreamingModel(event.model || '');
                        break;
                    case 'token':
                        streamingContentRef.current += event.content;
                        setStreamingContent(streamingContentRef.current);
                        break;
                    case 'tool_start': {
                        const newTool: ToolCallCard = { name: event.name, args: event.args, status: 'running' };
                        streamingToolsRef.current = [...streamingToolsRef.current, newTool];
                        setStreamingTools(streamingToolsRef.current);
                        break;
                    }
                    case 'tool_result': {
                        streamingToolsRef.current = streamingToolsRef.current.map((tool) =>
                            tool.name === event.name && tool.status === 'running'
                                ? { ...tool, status: 'done' as const, output: event.output }
                                : tool
                        );
                        setStreamingTools(streamingToolsRef.current);
                        break;
                    }
                    case 'done': {
                        const finalContent = streamingContentRef.current;
                        const finalTools = streamingToolsRef.current;
                        setMessages((prev) => [
                            ...prev,
                            {
                                role: 'agent',
                                content: finalContent || 'Agent completed.',
                                modelUsed: event.model_used,
                                tokensApprox: event.context_tokens_approx,
                                toolCalls: finalTools.length > 0 ? finalTools : undefined,
                            },
                        ]);
                        setStreamingContent('');
                        streamingContentRef.current = '';
                        setStreamingTools([]);
                        streamingToolsRef.current = [];
                        setStreamingModel('');
                        setIsStreaming(false);
                        isStreamingRef.current = false;
                        abortControllerRef.current = null;
                        if (readyFiles.length > 0) {
                            setAttachedFiles((prev) => prev.filter((file) => file.status !== 'ready'));
                        }
                        if (event.conversation_id) {
                            setConversationId(event.conversation_id);
                            void refreshConversations();
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('conversation-updated'));
                            }
                        }
                        if (event.actions && event.actions.length > 0) {
                            const changedPaths = event.actions
                                .filter((action): action is AgentAction & { path: string } =>
                                    ['file_edit', 'file_create', 'file_delete'].includes(action.type) && typeof action.path === 'string'
                                )
                                .map((action) => {
                                    let cleaned = action.path;
                                    if (cleaned.startsWith('/workspace/')) cleaned = cleaned.replace('/workspace/', '');
                                    if (cleaned.startsWith('./')) cleaned = cleaned.substring(2);
                                    if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
                                    return cleaned;
                                })
                                .filter((path) => path.length > 0);
                            const refreshOpenEditors = event.actions.some((action) => action.type === 'run_command');
                            if ((changedPaths.length > 0 || refreshOpenEditors) && onFileChangedRef.current) {
                                void onFileChangedRef.current(
                                    changedPaths.length > 0 ? changedPaths : undefined,
                                    { refreshOpenEditors }
                                );
                            }
                        }
                        break;
                    }
                    case 'error': {
                        const errContent = streamingContentRef.current;
                        const errTools = streamingToolsRef.current;
                        setMessages((prev) => [
                            ...prev,
                            {
                                role: 'agent',
                                content: errContent || `⚠️ ${event.message}`,
                                toolCalls: errTools.length > 0 ? errTools : undefined,
                            },
                        ]);
                        setStreamingContent('');
                        streamingContentRef.current = '';
                        setStreamingTools([]);
                        streamingToolsRef.current = [];
                        setStreamingModel('');
                        setIsStreaming(false);
                        isStreamingRef.current = false;
                        abortControllerRef.current = null;
                        break;
                    }
                }
            },
            (error: Error) => {
                setMessages((prev) => [...prev, { role: 'agent', content: `Error: ${error.message}` }]);
                setStreamingContent('');
                setStreamingTools([]);
                setStreamingModel('');
                setIsStreaming(false);
                isStreamingRef.current = false;
                abortControllerRef.current = null;
            },
            () => { /* SSE stream closed — done handles finalization */ }
        );

        abortControllerRef.current = controller;
    }, [attachedFiles, input, workspaceId, contextFilePaths, provider, conversationId, refreshConversations]);

    const handleClearHistory = useCallback(async () => {
        if (!conversationId) return;
        if (!confirm('Clear all chat history for this workspace?')) return;
        try {
            await apiClient.deleteConversation(conversationId);
            clearStreamingState();
            setMessages([]);
            setConversationId(null);
            setAttachedFiles([]);
            setShowHistory(false);
            setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('conversation-updated'));
            }
        } catch (err) {
            console.error('Failed to clear history:', err);
        }
    }, [clearStreamingState, conversationId]);

    const handleNewConversation = useCallback(() => {
        clearStreamingState();
        setMessages([]);
        setConversationId(null);
        setInput('');
        setAttachedFiles([]);
        setShowHistory(false);
        setHistoryError(null);
    }, [clearStreamingState]);

    const handleToggleHistory = useCallback(async () => {
        const nextShowHistory = !showHistory;
        setShowHistory(nextShowHistory);
        if (nextShowHistory) {
            try { await refreshConversations(); } catch { /* surfaced in panel */ }
        }
    }, [refreshConversations, showHistory]);

    const handleSelectConversation = useCallback(async (nextConversationId: number) => {
        try {
            setAttachedFiles([]);
            await loadConversation(nextConversationId);
        } catch (error) {
            console.error('Failed to load conversation:', error);
        }
    }, [loadConversation]);

    const handleDeleteConversation = useCallback(async (conversation: ConversationListItem) => {
        try {
            await apiClient.deleteConversation(conversation.id);
            setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
            if (conversation.id === conversationId) {
                clearStreamingState();
                setMessages([]);
                setConversationId(null);
                setAttachedFiles([]);
            }
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('conversation-updated'));
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        }
    }, [clearStreamingState, conversationId]);

    useEffect(() => {
        if (!showHistory) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (historyPanelRef.current?.contains(target) || historyButtonRef.current?.contains(target)) return;
            setShowHistory(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [showHistory]);

    const formatConversationDate = useCallback((timestamp: string) => (
        new Date(timestamp).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
    ), []);

    const handleFileAttach = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;
        event.target.value = '';
        for (const file of files) {
            const placeholder: AttachedFile = { name: file.name, fileType: 'unknown', text: '', charCount: 0, truncated: false, status: 'extracting' };
            setAttachedFiles((prev) => [...prev, placeholder]);
            try {
                const result = await apiClient.extractFileText(file);
                setAttachedFiles((prev) => prev.map((attachedFile) =>
                    attachedFile.name === file.name && attachedFile.status === 'extracting'
                        ? { ...attachedFile, name: result.filename, fileType: result.file_type, text: result.text, charCount: result.char_count, truncated: result.truncated, status: 'ready' as const }
                        : attachedFile
                ));
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Extraction failed';
                setAttachedFiles((prev) => prev.map((attachedFile) =>
                    attachedFile.name === file.name && attachedFile.status === 'extracting'
                        ? { ...attachedFile, status: 'error' as const, error: message }
                        : attachedFile
                ));
            }
        }
    }, []);

    const removeAttachedFile = useCallback((name: string) => {
        setAttachedFiles((prev) => prev.filter((file) => file.name !== name));
    }, []);

    return (
        <div className={`h-full flex flex-col bg-[#0B0F0E] border-l border-[#1F2D28] ${isVisible ? '' : 'hidden'}`}>

            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#1F2D28] bg-[#111917] shrink-0">
                {/* Left: icon + title + streaming model badge */}
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-[#2EFF7B] shrink-0" />
                    <span className="text-sm font-semibold text-[#E6F1EC] whitespace-nowrap">AI Agent</span>
                    {streamingModel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2EFF7B]/10 text-[#2EFF7B] font-mono truncate">
                            {streamingModel}
                        </span>
                    )}
                </div>

                {/* Right: New + History + Trash — all same size, same style */}
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        type="button"
                        onClick={handleNewConversation}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1F2D28] bg-[#1A2420] text-[#8FAEA2] transition-colors hover:border-[#2EFF7B]/40 hover:text-[#2EFF7B]"
                        title="New conversation"
                        aria-label="Start a new conversation"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>

                    <button
                        ref={historyButtonRef}
                        type="button"
                        onClick={handleToggleHistory}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border bg-[#1A2420] transition-colors ${showHistory
                            ? 'border-[#2EFF7B]/50 text-[#2EFF7B]'
                            : 'border-[#1F2D28] text-[#8FAEA2] hover:border-[#2EFF7B]/40 hover:text-[#2EFF7B]'
                            }`}
                        title="Chat history"
                        aria-label="View chat history"
                    >
                        <Clock3 className="w-3.5 h-3.5" />
                    </button>

                    {conversationId && (
                        <button
                            onClick={handleClearHistory}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1F2D28] bg-[#1A2420] text-[#5A7268] transition-colors hover:border-red-400/40 hover:text-red-400 hover:bg-red-400/10"
                            title="Clear chat history"
                            aria-label="Clear chat history"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Subtitle */}
            <div className="px-3 py-1 bg-[#111917] border-b border-[#1F2D28] shrink-0">
                <p className="text-[10px] text-[#5A7268]">Real-time streaming agent with tool calls</p>
            </div>

            {/* Context files */}
            {contextFilePaths && contextFilePaths.length > 0 && (
                <div className="px-3 py-2 border-b border-[#1F2D28] bg-[#0F1513] shrink-0">
                    <div className="text-[10px] uppercase tracking-wide text-[#5A7268]">Context Files</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                        {contextFilePaths.map((path) => (
                            <span key={path} className="px-2 py-1 rounded-full bg-[#1A2420] text-[10px] text-[#8FAEA2] border border-[#1F2D28]">
                                {path}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Messages area wrapper — relative so history panel overlays */}
            <div className="flex-1 min-h-0 relative">
                {/* History Panel — overlays from top-right, always visible */}
                {showHistory && (
                    <div
                        ref={historyPanelRef}
                        className="absolute top-3 right-3 z-20 w-[320px] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-2xl border border-[#1F2D28] bg-[#111917]/95 shadow-2xl shadow-black/40 backdrop-blur"
                    >
                        <div className="flex items-center justify-between border-b border-[#1F2D28] px-4 py-3">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-[#8FAEA2]">Chat History</div>
                                <div className="text-[10px] text-[#5A7268]">{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHistory(false)}
                                className="rounded-lg p-1 text-[#5A7268] transition-colors hover:bg-[#1A2420] hover:text-[#E6F1EC]"
                                aria-label="Close history"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="max-h-[360px] overflow-y-auto p-2">
                            {isHistoryLoading ? (
                                <div className="flex items-center gap-2 px-2 py-4 text-sm text-[#8FAEA2]">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading conversations...
                                </div>
                            ) : historyError ? (
                                <div className="px-2 py-4 text-sm text-red-400">{historyError}</div>
                            ) : conversations.length === 0 ? (
                                <div className="px-2 py-4 text-sm text-[#5A7268]">No previous conversations for this workspace.</div>
                            ) : (
                                conversations.map((conversation) => {
                                    const isActiveConversation = conversation.id === conversationId;
                                    return (
                                        <div
                                            key={conversation.id}
                                            className={`group flex items-start gap-2 rounded-xl border px-3 py-2 transition-colors ${isActiveConversation
                                                ? 'border-[#2EFF7B]/40 bg-[#2EFF7B]/10'
                                                : 'border-transparent hover:border-[#1F2D28] hover:bg-[#1A2420]'
                                                }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => void handleSelectConversation(conversation.id)}
                                                className="min-w-0 flex-1 text-left"
                                            >
                                                <div className={`truncate text-sm font-medium ${isActiveConversation ? 'text-[#2EFF7B]' : 'text-[#E6F1EC]'}`}>
                                                    {conversation.title || 'Untitled conversation'}
                                                </div>
                                                <div className="mt-1 text-[10px] text-[#5A7268]">
                                                    {formatConversationDate(conversation.updated_at || conversation.created_at)}
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleDeleteConversation(conversation)}
                                                className="mt-0.5 rounded-lg p-1 text-[#5A7268] opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
                                                title="Delete conversation"
                                                aria-label={`Delete ${conversation.title || 'conversation'}`}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* Scrollable messages */}
                <div className="h-full overflow-y-auto p-4 space-y-4">

                    {messages.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center animate-fadeIn pt-10">
                            <div className="mb-6 flex flex-col items-center">
                                <div className="w-16 h-16 rounded-3xl bg-[#1A2420] border-2 border-[#1F2D28] flex items-center justify-center mb-6">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2EFF7B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        <line x1="12" y1="8" x2="12" y2="12"></line>
                                        <line x1="9" y1="12" x2="15" y2="12"></line>
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-bold text-[#E6F1EC] mb-3">New chat with Agent</h2>
                                <p className="text-sm text-[#8FAEA2] max-w-sm leading-relaxed">Agent can make changes, review its work, and debug itself automatically.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5 max-w-lg w-full">
                                {[
                                    { icon: "🔍", text: "Explore this project" },
                                    { icon: "🐛", text: "Find and fix bugs" },
                                    { icon: "📖", text: "Explain the codebase" },
                                    { icon: "✨", text: "Add a new feature" },
                                ].map((chip, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => { setInput(chip.text); }}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-[#1A2420]/60 border border-[#1F2D28] rounded-xl text-[13px] text-[#8FAEA2] hover:text-[#E6F1EC] hover:border-[#2EFF7B]/30 hover:bg-[#1A2420] transition-all text-left"
                                    >
                                        <span>{chip.icon}</span>
                                        <span>{chip.text}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((message, index) => (
                        <div key={index} className={`flex gap-3 animate-fadeIn ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>

                            {/* ── Avatar — same for both roles ── */}
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 bg-[#1A2420] border border-[#1F2D28] text-[#2EFF7B]">
                                <span className="text-xs font-bold">{message.role === 'user' ? 'U' : 'AI'}</span>
                            </div>

                            {/* ── Bubble — same dark card for both roles ── */}
                            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-[#111917] border border-[#1F2D28] text-[#E6F1EC]">
                                {message.toolCalls && message.toolCalls.length > 0 && (
                                    <div className="mb-3 space-y-1">
                                        {message.toolCalls.map((tc, i) => (
                                            <ToolCallBadge key={i} tool={tc} />
                                        ))}
                                    </div>
                                )}
                                <div className="prose prose-sm max-w-none prose-invert">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ className, children, ...props }) {
                                                const match = /language-(\w+)/.exec(className || "");
                                                const codeString = String(children).replace(/\n$/, "");
                                                const lang = match ? match[1] : "";
                                                if (match) {
                                                    return (
                                                        <div className="my-3">
                                                            <div className="relative rounded-xl overflow-hidden bg-[#0B0F0E] border border-[#1F2D28]">
                                                                <div className="flex items-center px-4 py-2 bg-[#1A2420] border-b border-[#1F2D28] gap-2">
                                                                    <div className="flex gap-1.5">
                                                                        <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                                                                        <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                                                                        <span className="w-3 h-3 rounded-full bg-[#27CA40]" />
                                                                    </div>
                                                                    <span className="text-xs text-[#5A7268] ml-2">{lang}</span>
                                                                </div>
                                                                <SyntaxHighlighter
                                                                    style={oneDark}
                                                                    language={lang}
                                                                    PreTag="div"
                                                                    customStyle={{ margin: 0, padding: "16px", background: "transparent", fontSize: "13px" }}
                                                                >
                                                                    {codeString}
                                                                </SyntaxHighlighter>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <code className="px-1.5 py-0.5 bg-[#1A2420] text-[#2EFF7B] rounded text-sm" {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            },
                                            p({ children }) { return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>; },
                                            ul({ children }) { return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>; },
                                            ol({ children }) { return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>; },
                                            h1({ children }) { return <h1 className="text-xl font-bold mb-2">{children}</h1>; },
                                            h2({ children }) { return <h2 className="text-lg font-bold mb-2">{children}</h2>; },
                                            h3({ children }) { return <h3 className="text-base font-semibold mb-1">{children}</h3>; },
                                            blockquote({ children }) { return <blockquote className="border-l-4 border-current pl-4 my-2 italic opacity-80">{children}</blockquote>; },
                                            table({ children }) { return <div className="overflow-x-auto my-3"><table className="min-w-full border border-[#1F2D28] rounded-lg overflow-hidden">{children}</table></div>; },
                                            th({ children }) { return <th className="px-4 py-2 bg-[#1A2420] text-[#E6F1EC] text-left font-semibold border-b border-[#1F2D28]">{children}</th>; },
                                            td({ children }) { return <td className="px-4 py-2 border-b border-[#1F2D28]">{children}</td>; },
                                        }}
                                    >
                                        {message.content}
                                    </ReactMarkdown>
                                </div>
                                {message.modelUsed && (
                                    <div className="flex items-center gap-1 mt-2 text-[10px] text-[#5A7268]">
                                        <Cpu className="w-3 h-3" />
                                        <span>{message.modelUsed}</span>
                                        <span>·</span>
                                        <span>~{message.tokensApprox} tokens</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Streaming message */}
                    {isStreaming && (
                        <div className="flex gap-3 animate-fadeIn">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 bg-[#1A2420] border border-[#1F2D28] text-[#2EFF7B]">
                                <span className="text-xs font-bold">AI</span>
                            </div>
                            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-[#111917] border border-[#1F2D28] text-[#E6F1EC]">
                                {streamingTools.length > 0 && (
                                    <div className="mb-3 space-y-1">
                                        {streamingTools.map((tc, i) => <ToolCallBadge key={i} tool={tc} />)}
                                    </div>
                                )}
                                {streamingContent ? (
                                    <div className="prose prose-sm max-w-none prose-invert">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {streamingContent + (streamingContent.endsWith('\n') ? '█' : ' █')}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[#8FAEA2]">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {streamingTools.length > 0 ? 'Executing tools...' : 'Thinking...'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
                {/* end scrollable messages */}
            </div>
            {/* end messages area wrapper */}

            {/* Input — Antigravity-style bottom bar */}
            <div className="shrink-0 border-t border-[#1F2D28] bg-[#111917]">
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
                        {attachedFiles.map((file, index) => (
                            <span
                                key={`${file.name}-${index}`}
                                title={file.error || (file.status === 'ready' ? `${file.charCount.toLocaleString()} chars extracted${file.truncated ? ' (truncated)' : ''}` : '')}
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${file.status === 'ready'
                                    ? 'bg-[#2EFF7B]/10 text-[#2EFF7B] border-[#2EFF7B]/30'
                                    : file.status === 'error'
                                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                        : 'bg-[#111917] text-[#8FAEA2] border-[#1F2D28] animate-pulse'
                                    }`}
                            >
                                {file.status === 'extracting' ? '...' : file.status === 'ready' ? (
                                    file.fileType === 'pdf' ? 'PDF' :
                                        file.fileType === 'word' ? 'DOC' :
                                            file.fileType === 'image' ? 'IMG' : 'FILE'
                                ) : 'ERR'}
                                <span className="max-w-[120px] truncate">{file.name}</span>
                                {file.status !== 'extracting' && (
                                    <button type="button" onClick={() => removeAttachedFile(file.name)} className="ml-1 opacity-60 hover:opacity-100" aria-label={`Remove ${file.name}`}>x</button>
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
                        onChange={(event) => {
                            setInput(event.target.value);
                            // Auto-grow
                            const el = event.target;
                            el.style.height = 'auto';
                            el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                handleSend();
                                // Reset height
                                if (inputRef.current) {
                                    inputRef.current.style.height = 'auto';
                                }
                            }
                        }}
                        placeholder="Ask anything ..."
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

                    {/* Model selector — inline */}
                    <div className="relative flex items-center group rounded-lg border border-transparent focus-within:border-[#2EFF7B]/30 focus-within:bg-[#1A2420] transition-colors">
                        <select
                            value={provider}
                            onChange={(event) => setProvider(event.target.value as AgentProvider)}
                            className="appearance-none bg-transparent py-1.5 pl-2 pr-6 text-[11px] font-medium text-[#8FDDB3] focus:outline-none focus:ring-0 border-none cursor-pointer"
                            style={{ outline: 'none', boxShadow: 'none' }}
                            aria-label="Agent provider"
                        >
                            {PROVIDER_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value} style={{ backgroundColor: '#111917', color: '#8FDDB3' }}>{option.label}</option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5A7268] group-hover:text-[#8FDDB3] transition-colors" />
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Send / Stop button — circular */}
                    {isStreaming ? (
                        <button
                            onClick={handleStop}
                            className="flex h-9 w-9 items-center justify-center bg-red-500/20 text-red-400 rounded-full hover:bg-red-500/30 transition-colors"
                            aria-label="Stop generation"
                        >
                            <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || attachedFiles.some((file) => file.status === 'extracting')}
                            className="flex h-9 w-9 items-center justify-center bg-[#2EFF7B] text-[#0B0F0E] rounded-full hover:bg-[#1ED760] disabled:opacity-40 disabled:bg-[#1A2420] disabled:text-[#5A7268] transition-all"
                            aria-label="Send message"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Tool Call Badge ───────────────────────────────────────────────

const ToolCallBadge: React.FC<{ tool: ToolCallCard }> = ({ tool }) => {
    const [expanded, setExpanded] = useState(false);
    const argSummary = Object.entries(tool.args)
        .map(([k, v]) => {
            const val = typeof v === 'string' ? v : JSON.stringify(v);
            return `${k}=${val.length > 30 ? val.slice(0, 30) + '…' : val}`;
        })
        .join(', ');

    return (
        <div className="rounded-lg border border-[#1F2D28] bg-[#0F1513] text-[11px] overflow-hidden">
            <button
                onClick={() => setExpanded((p) => !p)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-[#1A2420]/50 transition-colors text-left"
            >
                {tool.status === 'running' ? (
                    <Loader2 className="w-3 h-3 text-[#E6CD69] animate-spin shrink-0" />
                ) : tool.status === 'done' ? (
                    <CheckCircle2 className="w-3 h-3 text-[#2EFF7B] shrink-0" />
                ) : (
                    <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <Wrench className="w-3 h-3 text-[#8FAEA2] shrink-0" />
                <span className="text-[#E6F1EC] font-mono font-semibold">{tool.name}</span>
                <span className="text-[#5A7268] truncate flex-1">({argSummary})</span>
                {tool.output && (
                    expanded
                        ? <ChevronUp className="w-3 h-3 text-[#5A7268] shrink-0" />
                        : <ChevronDown className="w-3 h-3 text-[#5A7268] shrink-0" />
                )}
            </button>
            {expanded && tool.output && (
                <div className="px-2 py-1.5 border-t border-[#1F2D28] max-h-32 overflow-y-auto">
                    <pre className="text-[10px] text-[#8FAEA2] whitespace-pre-wrap break-words font-mono">
                        {tool.output}
                    </pre>
                </div>
            )}
        </div>
    );
};