"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Bot, Clock3, History, Loader2, Play, RefreshCw } from "lucide-react";
import { apiClient, ExecuteResponse, getErrorMessage } from "@/lib/api";

const Editor = dynamic(() => import("@monaco-editor/react").then((module) => module.default), { ssr: false });

const LANGUAGES = [
    { id: "python", label: "Python", shortLabel: "PY" },
    { id: "javascript", label: "JavaScript", shortLabel: "JS" },
    { id: "cpp", label: "C++", shortLabel: "C++" },
    { id: "java", label: "Java", shortLabel: "JV" },
];

const LANG_MONACO_MAP: Record<string, string> = {
    python: "python",
    javascript: "javascript",
    cpp: "cpp",
    java: "java",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    success: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Success" },
    error: { bg: "bg-red-500/15", text: "text-red-400", label: "Error" },
    timeout: { bg: "bg-amber-500/15", text: "text-amber-400", label: "Timeout" },
    running: { bg: "bg-blue-500/15", text: "text-blue-400", label: "Running" },
    pending: { bg: "bg-gray-500/15", text: "text-gray-400", label: "Pending" },
};

interface MonacoEditorInstance {
    addCommand: (keybinding: number, handler: () => void) => void;
}

interface MonacoNamespace {
    KeyMod: { CtrlCmd: number };
    KeyCode: { Enter: number };
}

export default function ExecutePage() {
    const [code, setCode] = useState('print("Hello, World!")');
    const [language, setLanguage] = useState("python");
    const [stdin, setStdin] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<ExecuteResponse | null>(null);
    const [history, setHistory] = useState<ExecuteResponse[]>([]);
    const [activeTab, setActiveTab] = useState<"stdout" | "stderr">("stdout");
    const [diagnostic, setDiagnostic] = useState<string | null>(null);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [showHistory, setShowHistory] = useState(true);

    useEffect(() => {
        void loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const response = await apiClient.getExecutionHistory(15);
            setHistory(response.executions);
        } catch (error) {
            console.error("Failed to load history:", error);
        }
    };

    const handleRun = async () => {
        if (!code.trim() || isRunning) return;

        setIsRunning(true);
        setResult(null);
        setDiagnostic(null);
        setActiveTab("stdout");

        try {
            const response = await apiClient.executeCode({
                code: code.trim(),
                language,
                stdin: stdin.trim() || undefined,
            });
            setResult(response);
            if (response.status === "error" || response.status === "timeout") {
                setActiveTab("stderr");
            }
            void loadHistory();
        } catch (error) {
            setResult({
                id: 0,
                language,
                status: "error",
                stderr: getErrorMessage(error, "Unknown error"),
                created_at: new Date().toISOString(),
            });
        } finally {
            setIsRunning(false);
        }
    };

    const handleDiagnose = async () => {
        if (!result || result.id === 0) return;

        setIsDiagnosing(true);
        try {
            const response = await apiClient.diagnoseExecution(result.id);
            setDiagnostic(response.diagnostic);
        } catch {
            setDiagnostic("Failed to get diagnosis. Please try again.");
        } finally {
            setIsDiagnosing(false);
        }
    };

    const loadExecution = (execution: ExecuteResponse) => {
        setResult(execution);
        setActiveTab(execution.status === "success" ? "stdout" : "stderr");
        setDiagnostic(null);
    };

    const statusStyle = result ? STATUS_STYLES[result.status] || STATUS_STYLES.pending : null;

    const handleEditorMount = (editor: MonacoEditorInstance, monacoInstance: MonacoNamespace) => {
        editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
            void handleRun();
        });
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-[#0B0F0E]">
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-[#1F2D28] bg-[#111917] px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 rounded-xl border border-[#1F2D28] bg-[#1A2420] p-1">
                            {LANGUAGES.map((entry) => (
                                <button
                                    key={entry.id}
                                    onClick={() => setLanguage(entry.id)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                                        language === entry.id
                                            ? "border border-[#2EFF7B]/30 bg-[#2EFF7B]/15 text-[#2EFF7B]"
                                            : "text-[#8FAEA2] hover:bg-[#1F2D28] hover:text-[#E6F1EC]"
                                    }`}
                                >
                                    {entry.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowHistory((current) => !current)}
                            className={`rounded-lg p-2 transition-colors ${
                                showHistory ? "bg-[#2EFF7B]/15 text-[#2EFF7B]" : "text-[#5A7268] hover:text-[#E6F1EC]"
                            }`}
                            title="Toggle history"
                        >
                            <History className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => void handleRun()}
                            disabled={isRunning || !code.trim()}
                            className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all ${
                                isRunning
                                    ? "cursor-wait bg-amber-500/20 text-amber-400"
                                    : "bg-[#2EFF7B] text-[#0B0F0E] hover:bg-[#1ED760] hover:shadow-lg hover:shadow-[#2EFF7B]/20"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                            title="Run code (Ctrl+Enter)"
                        >
                            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                            {isRunning ? "Running..." : "Run"}
                            <kbd className="ml-1 rounded bg-[#0B0F0E]/30 px-1 py-0.5 font-mono text-[10px] opacity-70">Ctrl+Enter</kbd>
                        </button>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 overflow-hidden">
                        <Editor
                            height="100%"
                            language={LANG_MONACO_MAP[language] || "plaintext"}
                            value={code}
                            theme="vs-dark"
                            onChange={(value) => setCode(value || "")}
                            onMount={handleEditorMount}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                                fontLigatures: true,
                                wordWrap: "on",
                                padding: { top: 16, bottom: 16 },
                                scrollBeyondLastLine: false,
                                smoothScrolling: true,
                                cursorBlinking: "smooth",
                                cursorSmoothCaretAnimation: "on",
                                formatOnPaste: true,
                                bracketPairColorization: { enabled: true },
                                guides: { bracketPairs: true, indentation: true },
                            }}
                            loading={<div className="flex h-full w-full items-center justify-center text-[#5A7268]">Loading Editor...</div>}
                        />
                    </div>

                    <div className="border-t border-[#1F2D28]">
                        <div className="flex items-center bg-[#111917] px-4 py-2">
                            <span className="mr-2 text-xs text-[#5A7268]">stdin:</span>
                            <input
                                type="text"
                                value={stdin}
                                onChange={(event) => setStdin(event.target.value)}
                                placeholder="Optional input..."
                                className="flex-1 bg-transparent font-mono text-sm text-[#E6F1EC] placeholder-[#3A4F46] focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex max-h-[350px] min-h-[200px] flex-col border-t border-[#1F2D28] bg-[#111917]">
                        <div className="flex items-center justify-between border-b border-[#1F2D28] px-4 py-2">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setActiveTab("stdout")}
                                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                                        activeTab === "stdout" ? "bg-[#2EFF7B]/15 text-[#2EFF7B]" : "text-[#5A7268] hover:text-[#E6F1EC]"
                                    }`}
                                >
                                    stdout
                                </button>
                                <button
                                    onClick={() => setActiveTab("stderr")}
                                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                                        activeTab === "stderr" ? "bg-red-500/15 text-red-400" : "text-[#5A7268] hover:text-[#E6F1EC]"
                                    }`}
                                >
                                    stderr
                                    {result?.stderr ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" /> : null}
                                </button>
                            </div>

                            {result ? (
                                <div className="flex items-center gap-3 text-xs">
                                    {statusStyle ? (
                                        <span className={`rounded-md px-2 py-0.5 font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                                            {statusStyle.label}
                                        </span>
                                    ) : null}
                                    {result.exit_code !== undefined && result.exit_code !== null ? (
                                        <span className="text-[#5A7268]">
                                            exit: <span className="text-[#8FAEA2]">{result.exit_code}</span>
                                        </span>
                                    ) : null}
                                    {result.execution_time_ms !== undefined ? (
                                        <span className="flex items-center gap-1 text-[#5A7268]">
                                            <Clock3 className="h-3 w-3" />
                                            <span className="text-[#8FAEA2]">{result.execution_time_ms}ms</span>
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        <div className="flex-1 overflow-auto p-4">
                            {isRunning ? (
                                <div className="flex items-center gap-2 text-sm text-[#5A7268]">
                                    <Loader2 className="h-4 w-4 animate-spin text-[#2EFF7B]" />
                                    Executing...
                                </div>
                            ) : result ? (
                                <pre className="whitespace-pre-wrap break-words font-mono text-sm text-[#E6F1EC]">
                                    {activeTab === "stdout" ? result.stdout || "(no output)" : result.stderr || "(no errors)"}
                                </pre>
                            ) : (
                                <p className="text-sm italic text-[#3A4F46]">Press Ctrl+Enter or click Run to execute your code.</p>
                            )}
                        </div>

                        {result && (result.status === "error" || result.status === "timeout") ? (
                            <div className="border-t border-[#1F2D28] px-4 py-2">
                                {diagnostic ? (
                                    <div className="rounded-xl border border-[#1F2D28] bg-[#1A2420] p-3">
                                        <div className="mb-2 flex items-center gap-2">
                                            <Bot className="h-4 w-4 text-amber-400" />
                                            <span className="text-xs font-semibold text-amber-400">AI Diagnosis</span>
                                        </div>
                                        <pre className="whitespace-pre-wrap font-mono text-xs text-[#E6F1EC]">{diagnostic}</pre>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => void handleDiagnose()}
                                        disabled={isDiagnosing}
                                        className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                                    >
                                        {isDiagnosing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                                        {isDiagnosing ? "Diagnosing..." : "Diagnose Error with AI"}
                                    </button>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {showHistory ? (
                <div className="flex w-72 flex-col border-l border-[#1F2D28] bg-[#111917]">
                    <div className="border-b border-[#1F2D28] px-4 py-3">
                        <h3 className="text-sm font-semibold text-[#E6F1EC]">Execution History</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {history.length === 0 ? (
                            <p className="p-4 text-xs italic text-[#3A4F46]">No executions yet</p>
                        ) : (
                            history.map((execution) => {
                                const status = STATUS_STYLES[execution.status] || STATUS_STYLES.pending;
                                const languageEntry = LANGUAGES.find((entry) => entry.id === execution.language);
                                const time = new Date(execution.created_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                });

                                return (
                                    <button
                                        key={execution.id}
                                        onClick={() => loadExecution(execution)}
                                        className={`w-full border-b border-[#1F2D28] px-4 py-3 text-left transition-colors hover:bg-[#1A2420] ${
                                            result?.id === execution.id ? "bg-[#1A2420]" : ""
                                        }`}
                                    >
                                        <div className="mb-1 flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#1A2420] text-[10px] font-semibold text-[#2EFF7B]">
                                                    {languageEntry?.shortLabel || "FILE"}
                                                </span>
                                                <span className="text-xs font-medium text-[#8FAEA2]">{languageEntry?.label || execution.language}</span>
                                            </div>
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] ${status.bg} ${status.text}`}>{status.label}</span>
                                        </div>
                                        <p className="truncate font-mono text-[11px] text-[#5A7268]">
                                            {execution.stdout?.substring(0, 40) || execution.stderr?.substring(0, 40) || "(no output)"}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2 text-[10px] text-[#3A4F46]">
                                            <span>{time}</span>
                                            {execution.execution_time_ms !== undefined ? <span>{execution.execution_time_ms}ms</span> : null}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    <div className="border-t border-[#1F2D28] p-3">
                        <button
                            onClick={() => void loadHistory()}
                            className="inline-flex items-center gap-2 text-xs text-[#8FAEA2] transition-colors hover:text-[#E6F1EC]"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Refresh history
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
