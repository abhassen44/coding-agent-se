'use client';

import React, { useState, useRef, useEffect } from 'react';
import { apiClient, AgentAction, AgentRequest, AgentResponse } from '@/lib/api';
import { DiffViewer } from './DiffViewer';
import { 
    Send, 
    Loader2, 
    Bot, 
    User, 
    CheckCircle2, 
    XCircle, 
    Cpu,
    Sparkles,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

interface ChatMessage {
    role: 'user' | 'agent';
    content: string;
    actions?: AgentAction[];
    modelUsed?: string;
    tokensApprox?: number;
}

interface WorkspaceChatProps {
    workspaceId: number;
    isVisible: boolean;
    onFileChanged?: () => void; // callback to refresh file tree after applying changes
}

export const WorkspaceChat: React.FC<WorkspaceChatProps> = ({ workspaceId, isVisible, onFileChanged }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'agent',
            content: '👋 Hi! I\'m your workspace AI agent. I can read your files, propose edits, create new files, or run commands. What would you like me to do?',
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [pendingActions, setPendingActions] = useState<AgentAction[] | null>(null);
    const [actionStates, setActionStates] = useState<Record<number, 'pending' | 'accepted' | 'rejected'>>({});
    const [isApplying, setIsApplying] = useState(false);
    const [provider, setProvider] = useState<AgentRequest['provider']>('auto');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pendingActions]);

    useEffect(() => {
        if (isVisible) inputRef.current?.focus();
    }, [isVisible]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);
        setPendingActions(null);

        try {
            const response = await apiClient.agentAct({
                workspace_id: workspaceId,
                prompt: userMessage,
                provider,
            });

            setMessages(prev => [...prev, {
                role: 'agent',
                content: response.explanation,
                actions: response.actions,
                modelUsed: response.model_used,
                tokensApprox: response.context_tokens_approx,
            }]);

            // LangGraph agent already executed actions — show as completed log
            if (response.actions.length > 0) {
                setPendingActions(response.actions);
                // All actions are already done — mark as accepted
                const states: Record<number, 'pending' | 'accepted' | 'rejected'> = {};
                response.actions.forEach((_, i) => { states[i] = 'accepted'; });
                setActionStates(states);
                // Refresh file tree since agent may have modified files
                onFileChanged?.();
            }
        } catch (err: any) {
            setMessages(prev => [...prev, {
                role: 'agent',
                content: `❌ Error: ${err.message || 'Failed to reach AI agent'}`,
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApply = async () => {
        if (!pendingActions) return;
        const accepted = pendingActions.filter((_, i) => actionStates[i] === 'accepted');
        if (accepted.length === 0) return;

        setIsApplying(true);
        try {
            const result = await apiClient.agentApply(workspaceId, accepted);
            const successCount = result.results.filter(r => r.success).length;
            const failCount = result.results.filter(r => !r.success).length;

            let summary = `✅ Applied ${successCount} action(s)`;
            if (failCount > 0) summary += `, ⚠️ ${failCount} failed`;

            // Add output details
            const outputs = result.results
                .filter(r => r.output || r.error)
                .map(r => r.success ? `✓ ${r.output}` : `✗ ${r.error}`)
                .join('\n');
            if (outputs) summary += `\n\n\`\`\`\n${outputs}\n\`\`\``;

            setMessages(prev => [...prev, { role: 'agent', content: summary }]);
            setPendingActions(null);
            setActionStates({});

            // Refresh file tree
            onFileChanged?.();
        } catch (err: any) {
            setMessages(prev => [...prev, {
                role: 'agent',
                content: `❌ Failed to apply: ${err.message}`,
            }]);
        } finally {
            setIsApplying(false);
        }
    };

    const handleAcceptAll = () => {
        if (!pendingActions) return;
        const states: Record<number, 'pending' | 'accepted' | 'rejected'> = {};
        pendingActions.forEach((_, i) => { states[i] = 'accepted'; });
        setActionStates(states);
    };

    const handleRejectAll = () => {
        setPendingActions(null);
        setActionStates({});
        setMessages(prev => [...prev, { role: 'agent', content: '🚫 All proposed changes rejected.' }]);
    };

    const acceptedCount = pendingActions
        ? pendingActions.filter((_, i) => actionStates[i] === 'accepted').length
        : 0;

    return (
        <div className={`h-full flex flex-col bg-[#0B0F0E] border-l border-[#1F2D28] ${isVisible ? '' : 'hidden'}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1F2D28] bg-[#111917] shrink-0">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#2EFF7B]" />
                    <span className="text-sm font-semibold text-[#E6F1EC]">AI Agent</span>
                </div>
                {/* Model selector */}
                <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as any)}
                    className="text-[10px] bg-[#1A2420] border border-[#1F2D28] text-[#8FAEA2] rounded px-2 py-1 focus:outline-none focus:border-[#2EFF7B]/50"
                >
                    <option value="auto">Auto</option>
                    <option value="gemini">Gemini</option>
                    <option value="qwen">Qwen</option>
                    <optgroup label="AWS Bedrock">
                        <option value="bedrock-claude-sonnet">Claude Sonnet</option>
                        <option value="bedrock-claude-haiku">Claude Haiku</option>
                        <option value="bedrock-llama">Llama 3.1 70B</option>
                        <option value="bedrock-mistral">Mistral Large</option>
                    </optgroup>
                </select>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'agent' && (
                            <div className="w-6 h-6 rounded-lg bg-[#2EFF7B]/15 flex items-center justify-center shrink-0 mt-0.5">
                                <Bot className="w-3.5 h-3.5 text-[#2EFF7B]" />
                            </div>
                        )}
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                            msg.role === 'user'
                                ? 'bg-[#2EFF7B]/15 text-[#E6F1EC]'
                                : 'bg-[#1A2420] text-[#E6F1EC]'
                        }`}>
                            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                            {msg.modelUsed && (
                                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[#5A7268]">
                                    <Cpu className="w-3 h-3" />
                                    {msg.modelUsed} • ~{msg.tokensApprox} tokens
                                </div>
                            )}
                        </div>
                        {msg.role === 'user' && (
                            <div className="w-6 h-6 rounded-lg bg-[#1A2420] flex items-center justify-center shrink-0 mt-0.5">
                                <User className="w-3.5 h-3.5 text-[#8FAEA2]" />
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="flex gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#2EFF7B]/15 flex items-center justify-center shrink-0">
                            <Bot className="w-3.5 h-3.5 text-[#2EFF7B]" />
                        </div>
                        <div className="bg-[#1A2420] rounded-xl px-3 py-2 text-sm text-[#8FAEA2] flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Agent working — exploring files, making changes...
                        </div>
                    </div>
                )}

                {/* Pending Actions Review */}
                {pendingActions && pendingActions.length > 0 && (
                    <div className="border border-[#1F2D28] rounded-xl overflow-hidden bg-[#111917]">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-[#1F2D28]">
                            <span className="text-xs font-semibold text-[#E6F1EC]">
                                Actions Taken ({pendingActions.length})
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleAcceptAll}
                                    className="text-[10px] px-2 py-1 bg-[#2EFF7B]/15 text-[#2EFF7B] rounded hover:bg-[#2EFF7B]/25 transition-colors"
                                >
                                    Accept All
                                </button>
                                <button
                                    onClick={handleRejectAll}
                                    className="text-[10px] px-2 py-1 bg-red-500/15 text-red-400 rounded hover:bg-red-500/25 transition-colors"
                                >
                                    Reject All
                                </button>
                            </div>
                        </div>

                        {/* Action list */}
                        <div className="divide-y divide-[#1F2D28]">
                            {pendingActions.map((action, i) => (
                                <ActionCard
                                    key={i}
                                    action={action}
                                    state={actionStates[i]}
                                    onAccept={() => setActionStates(prev => ({ ...prev, [i]: 'accepted' }))}
                                    onReject={() => setActionStates(prev => ({ ...prev, [i]: 'rejected' }))}
                                />
                            ))}
                        </div>

                        {/* Apply button */}
                        {acceptedCount > 0 && (
                            <div className="px-3 py-2 border-t border-[#1F2D28]">
                                <button
                                    onClick={handleApply}
                                    disabled={isApplying}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-[#2EFF7B] text-[#0B0F0E] text-sm font-semibold rounded-lg hover:bg-[#1ED760] disabled:opacity-50 transition-colors"
                                >
                                    {isApplying ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Applying...</>
                                    ) : (
                                        <><CheckCircle2 className="w-4 h-4" /> Apply {acceptedCount} Change(s)</>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 p-3 border-t border-[#1F2D28]">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Ask the AI to modify files, run commands..."
                        rows={1}
                        className="flex-1 bg-[#1A2420] border border-[#1F2D28] rounded-xl px-3 py-2 text-sm text-[#E6F1EC] placeholder-[#5A7268] focus:outline-none focus:border-[#2EFF7B]/50 resize-none"
                        style={{ maxHeight: '120px' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-2.5 bg-[#2EFF7B] text-[#0B0F0E] rounded-xl hover:bg-[#1ED760] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};


// ── Action Card component ────────────────────────────────────

const ActionCard: React.FC<{
    action: AgentAction;
    state: 'pending' | 'accepted' | 'rejected';
    onAccept: () => void;
    onReject: () => void;
}> = ({ action, state, onAccept, onReject }) => {
    const [expanded, setExpanded] = useState(false);

    const typeLabels: Record<string, { icon: string; label: string; color: string }> = {
        file_edit: { icon: '✏️', label: 'Edit', color: 'text-[#E6CD69]' },
        file_create: { icon: '📄', label: 'Create', color: 'text-[#2EFF7B]' },
        file_delete: { icon: '🗑️', label: 'Delete', color: 'text-red-400' },
        run_command: { icon: '⚡', label: 'Command', color: 'text-[#69B4E6]' },
    };

    const typeInfo = typeLabels[action.type] || typeLabels.file_edit;

    return (
        <div className={`px-3 py-2 ${state === 'rejected' ? 'opacity-40' : ''}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm">{typeInfo.icon}</span>
                    <span className={`text-[10px] font-semibold uppercase ${typeInfo.color}`}>
                        {typeInfo.label}
                    </span>
                    <span className="text-xs text-[#E6F1EC] truncate">
                        {action.path || action.command}
                    </span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    {action.content && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="p-1 text-[#5A7268] hover:text-[#E6F1EC] rounded"
                        >
                            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                    )}
                    <button
                        onClick={onAccept}
                        className={`p-1 rounded transition-colors ${
                            state === 'accepted'
                                ? 'bg-[#2EFF7B]/20 text-[#2EFF7B]'
                                : 'text-[#5A7268] hover:text-[#2EFF7B] hover:bg-[#2EFF7B]/10'
                        }`}
                        title="Accept"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onReject}
                        className={`p-1 rounded transition-colors ${
                            state === 'rejected'
                                ? 'bg-red-500/20 text-red-400'
                                : 'text-[#5A7268] hover:text-red-400 hover:bg-red-500/10'
                        }`}
                        title="Reject"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            <p className="text-[10px] text-[#8FAEA2] mt-0.5">{action.description}</p>

            {/* Expandable content preview */}
            {expanded && action.content && (
                <div className="mt-2">
                    <DiffViewer content={action.content} path={action.path || ''} />
                </div>
            )}
        </div>
    );
};
