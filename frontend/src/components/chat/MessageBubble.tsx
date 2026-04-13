"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
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
        window.setTimeout(() => setCopiedCode(null), 2000);
    };

    const runCode = async (code: string, language: string) => {
        let normalizedLanguage = language.toLowerCase();
        if (normalizedLanguage === "js") normalizedLanguage = "javascript";
        if (normalizedLanguage === "py") normalizedLanguage = "python";

        setRunningCode(code);
        try {
            const result = await apiClient.executeCode({ code, language: normalizedLanguage });
            setExecResults((current) => ({
                ...current,
                [code]: {
                    status: result.status,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exit_code: result.exit_code,
                    execution_time_ms: result.execution_time_ms,
                    id: result.id,
                },
            }));
        } catch (error) {
            setExecResults((current) => ({
                ...current,
                [code]: {
                    status: "error",
                    stderr: error instanceof Error ? error.message : "Execution failed",
                },
            }));
        } finally {
            setRunningCode(null);
        }
    };

    return (
        <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} animate-fadeIn`}>
            <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                    isUser ? "bg-[#2EFF7B] text-[#0B0F0E]" : "border border-[#1F2D28] bg-[#1A2420] text-[#2EFF7B]"
                }`}
            >
                <span className="text-xs font-bold">{isUser ? "U" : "AI"}</span>
            </div>

            <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    isUser ? "rounded-br-md bg-[#2EFF7B] text-[#0B0F0E]" : "rounded-bl-md border border-[#1F2D28] bg-[#111917] text-[#E6F1EC]"
                }`}
            >
                <div className="prose prose-sm max-w-none prose-invert">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code({ className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const codeString = String(children).replace(/\n$/, "");
                                const language = match ? match[1] : "";
                                const isRunnable = RUNNABLE_LANGUAGES.includes(language.toLowerCase());
                                const isThisRunning = runningCode === codeString;
                                const execResult = execResults[codeString];

                                if (match) {
                                    return (
                                        <div className="my-3">
                                            <div className="relative overflow-hidden rounded-xl border border-[#1F2D28] bg-[#0B0F0E]">
                                                <div className="flex items-center justify-between border-b border-[#1F2D28] bg-[#1A2420] px-4 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex gap-1.5">
                                                            <span className="h-3 w-3 rounded-full bg-[#FF5F56]" />
                                                            <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
                                                            <span className="h-3 w-3 rounded-full bg-[#27CA40]" />
                                                        </div>
                                                        <span className="ml-2 text-xs text-[#5A7268]">{language}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {isRunnable ? (
                                                            <button
                                                                onClick={() => void runCode(codeString, language)}
                                                                disabled={isThisRunning}
                                                                className={`text-xs transition-colors ${
                                                                    isThisRunning ? "cursor-wait text-amber-400" : "text-[#2EFF7B] hover:text-[#1ED760]"
                                                                }`}
                                                            >
                                                                {isThisRunning ? "Running" : "Run"}
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            onClick={() => copyToClipboard(codeString)}
                                                            className="text-xs text-[#5A7268] transition-colors hover:text-[#2EFF7B]"
                                                        >
                                                            {copiedCode === codeString ? "Copied" : "Copy"}
                                                        </button>
                                                    </div>
                                                </div>
                                                <SyntaxHighlighter
                                                    style={oneDark}
                                                    language={language}
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

                                            {execResult ? (
                                                <div
                                                    className={`mt-1 overflow-hidden rounded-xl border text-xs font-mono ${
                                                        execResult.status === "success"
                                                            ? "border-emerald-500/30 bg-emerald-500/5"
                                                            : "border-red-500/30 bg-red-500/5"
                                                    }`}
                                                >
                                                    <div
                                                        className={`flex items-center justify-between px-3 py-1.5 ${
                                                            execResult.status === "success"
                                                                ? "bg-emerald-500/10 text-emerald-400"
                                                                : "bg-red-500/10 text-red-400"
                                                        }`}
                                                    >
                                                        <span className="font-semibold">{execResult.status === "success" ? "Output" : "Error"}</span>
                                                        <div className="flex items-center gap-2 text-[10px] opacity-70">
                                                            {execResult.execution_time_ms !== undefined ? (
                                                                <span>{execResult.execution_time_ms}ms</span>
                                                            ) : null}
                                                            {execResult.exit_code !== undefined ? <span>exit: {execResult.exit_code}</span> : null}
                                                        </div>
                                                    </div>
                                                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words p-3 text-[#E6F1EC]">
                                                        {execResult.status === "success" ? execResult.stdout || "(no output)" : execResult.stderr || "(no error details)"}
                                                    </pre>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                }

                                return (
                                    <code className="rounded bg-[#1A2420] px-1.5 py-0.5 text-sm text-[#2EFF7B]" {...props}>
                                        {children}
                                    </code>
                                );
                            },
                            p({ children }) {
                                return <p className="mb-2 leading-relaxed last:mb-0">{children}</p>;
                            },
                            ul({ children }) {
                                return <ul className="mb-2 list-inside list-disc space-y-1">{children}</ul>;
                            },
                            ol({ children }) {
                                return <ol className="mb-2 list-inside list-decimal space-y-1">{children}</ol>;
                            },
                            h1({ children }) {
                                return <h1 className="mb-2 text-xl font-bold text-[#2EFF7B]">{children}</h1>;
                            },
                            h2({ children }) {
                                return <h2 className="mb-2 text-lg font-bold text-[#2EFF7B]">{children}</h2>;
                            },
                            h3({ children }) {
                                return <h3 className="mb-1 text-base font-semibold text-[#2EFF7B]">{children}</h3>;
                            },
                            blockquote({ children }) {
                                return <blockquote className="my-2 border-l-4 border-[#2EFF7B] pl-4 italic text-[#8FAEA2]">{children}</blockquote>;
                            },
                            table({ children }) {
                                return (
                                    <div className="my-3 overflow-x-auto">
                                        <table className="min-w-full overflow-hidden rounded-lg border border-[#1F2D28]">{children}</table>
                                    </div>
                                );
                            },
                            th({ children }) {
                                return <th className="border-b border-[#1F2D28] bg-[#1A2420] px-4 py-2 text-left font-semibold text-[#E6F1EC]">{children}</th>;
                            },
                            td({ children }) {
                                return <td className="border-b border-[#1F2D28] px-4 py-2">{children}</td>;
                            },
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>

                <div suppressHydrationWarning className={`mt-2 text-xs ${isUser ? "text-[#0B0F0E]/60" : "text-[#5A7268]"}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
            </div>
        </div>
    );
}
