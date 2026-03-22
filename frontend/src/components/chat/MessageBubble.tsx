"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState } from "react";
import { apiClient } from "@/lib/api";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

interface MessageBubbleProps {
    message: Message;
}

interface CodeExecResult {
    status: string;
    stdout?: string;
    stderr?: string;
    exit_code?: number;
    execution_time_ms?: number;
    id?: number;
}

const RUNNABLE_LANGUAGES = ["python", "javascript", "js", "cpp", "java", "py"];

export default function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === "user";
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [runningCode, setRunningCode] = useState<string | null>(null);
    const [execResults, setExecResults] = useState<Record<string, CodeExecResult>>({});

    const copyToClipboard = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const runCode = async (code: string, language: string) => {
        // Normalize language names
        let lang = language.toLowerCase();
        if (lang === "js") lang = "javascript";
        if (lang === "py") lang = "python";

        setRunningCode(code);
        try {
            const result = await apiClient.executeCode({ code, language: lang });
            setExecResults((prev) => ({
                ...prev,
                [code]: {
                    status: result.status,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exit_code: result.exit_code,
                    execution_time_ms: result.execution_time_ms,
                    id: result.id,
                },
            }));
        } catch (err) {
            setExecResults((prev) => ({
                ...prev,
                [code]: {
                    status: "error",
                    stderr: err instanceof Error ? err.message : "Execution failed",
                },
            }));
        } finally {
            setRunningCode(null);
        }
    };

    return (
        <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} animate-fadeIn`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isUser
                    ? "bg-[#2EFF7B] text-[#0B0F0E]"
                    : "bg-[#1A2420] border border-[#1F2D28] text-[#2EFF7B]"
                }`}>
                <span className="text-xs font-bold">{isUser ? "U" : "AI"}</span>
            </div>

            {/* Message Content */}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser
                    ? "bg-[#2EFF7B] text-[#0B0F0E] rounded-br-md"
                    : "bg-[#111917] border border-[#1F2D28] text-[#E6F1EC] rounded-bl-md"
                }`}>
                <div className="prose prose-sm max-w-none prose-invert">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code({ node, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const codeString = String(children).replace(/\n$/, "");
                                const lang = match ? match[1] : "";
                                const isRunnable = RUNNABLE_LANGUAGES.includes(lang.toLowerCase());
                                const isThisRunning = runningCode === codeString;
                                const execResult = execResults[codeString];

                                if (match) {
                                    return (
                                        <div className="my-3">
                                            <div className="relative rounded-xl overflow-hidden bg-[#0B0F0E] border border-[#1F2D28]">
                                                {/* Code Header */}
                                                <div className="flex items-center justify-between px-4 py-2 bg-[#1A2420] border-b border-[#1F2D28]">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex gap-1.5">
                                                            <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                                                            <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                                                            <span className="w-3 h-3 rounded-full bg-[#27CA40]" />
                                                        </div>
                                                        <span className="text-xs text-[#5A7268] ml-2">{lang}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {isRunnable && (
                                                            <button
                                                                onClick={() => runCode(codeString, lang)}
                                                                disabled={isThisRunning}
                                                                className={`flex items-center gap-1 text-xs transition-colors ${
                                                                    isThisRunning
                                                                        ? "text-amber-400 cursor-wait"
                                                                        : "text-[#2EFF7B] hover:text-[#1ED760]"
                                                                }`}
                                                            >
                                                                {isThisRunning ? (
                                                                    <>
                                                                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                        </svg>
                                                                        Running
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                                                            <path d="M8 5v14l11-7z" />
                                                                        </svg>
                                                                        Run
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => copyToClipboard(codeString)}
                                                            className="text-xs text-[#5A7268] hover:text-[#2EFF7B] transition-colors"
                                                        >
                                                            {copiedCode === codeString ? "✓ Copied" : "Copy"}
                                                        </button>
                                                    </div>
                                                </div>
                                                <SyntaxHighlighter
                                                    style={oneDark}
                                                    language={lang}
                                                    PreTag="div"
                                                    customStyle={{
                                                        margin: 0,
                                                        padding: "16px",
                                                        background: "transparent",
                                                        fontSize: "13px",
                                                    }}
                                                >
                                                    {codeString}
                                                </SyntaxHighlighter>
                                            </div>

                                            {/* Inline Execution Result */}
                                            {execResult && (
                                                <div className={`mt-1 rounded-xl border overflow-hidden text-xs font-mono ${
                                                    execResult.status === "success"
                                                        ? "border-emerald-500/30 bg-emerald-500/5"
                                                        : "border-red-500/30 bg-red-500/5"
                                                }`}>
                                                    <div className={`flex items-center justify-between px-3 py-1.5 ${
                                                        execResult.status === "success"
                                                            ? "bg-emerald-500/10 text-emerald-400"
                                                            : "bg-red-500/10 text-red-400"
                                                    }`}>
                                                        <span className="font-semibold">
                                                            {execResult.status === "success" ? "✓ Output" : "✕ Error"}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-[10px] opacity-70">
                                                            {execResult.execution_time_ms !== undefined && (
                                                                <span>⏱ {execResult.execution_time_ms}ms</span>
                                                            )}
                                                            {execResult.exit_code !== undefined && (
                                                                <span>exit: {execResult.exit_code}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <pre className="p-3 text-[#E6F1EC] whitespace-pre-wrap break-words max-h-40 overflow-auto">
                                                        {execResult.status === "success"
                                                            ? execResult.stdout || "(no output)"
                                                            : execResult.stderr || "(no error details)"}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                return (
                                    <code className="px-1.5 py-0.5 bg-[#1A2420] text-[#2EFF7B] rounded text-sm" {...props}>
                                        {children}
                                    </code>
                                );
                            },
                            p({ children }) {
                                return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
                            },
                            ul({ children }) {
                                return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
                            },
                            ol({ children }) {
                                return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
                            },
                            h1({ children }) {
                                return <h1 className="text-xl font-bold text-[#2EFF7B] mb-2">{children}</h1>;
                            },
                            h2({ children }) {
                                return <h2 className="text-lg font-bold text-[#2EFF7B] mb-2">{children}</h2>;
                            },
                            h3({ children }) {
                                return <h3 className="text-base font-semibold text-[#2EFF7B] mb-1">{children}</h3>;
                            },
                            blockquote({ children }) {
                                return (
                                    <blockquote className="border-l-4 border-[#2EFF7B] pl-4 my-2 text-[#8FAEA2] italic">
                                        {children}
                                    </blockquote>
                                );
                            },
                            table({ children }) {
                                return (
                                    <div className="overflow-x-auto my-3">
                                        <table className="min-w-full border border-[#1F2D28] rounded-lg overflow-hidden">
                                            {children}
                                        </table>
                                    </div>
                                );
                            },
                            th({ children }) {
                                return <th className="px-4 py-2 bg-[#1A2420] text-left text-[#E6F1EC] font-semibold border-b border-[#1F2D28]">{children}</th>;
                            },
                            td({ children }) {
                                return <td className="px-4 py-2 border-b border-[#1F2D28]">{children}</td>;
                            },
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>

                {/* Timestamp */}
                <div className={`text-xs mt-2 ${isUser ? "text-[#0B0F0E]/60" : "text-[#5A7268]"}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
            </div>
        </div>
    );
}
