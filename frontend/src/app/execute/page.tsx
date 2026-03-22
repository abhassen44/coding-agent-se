"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { apiClient, ExecuteResponse } from "@/lib/api";

const Editor = dynamic(() => import("@monaco-editor/react").then(m => m.default), { ssr: false });

const LANGUAGES = [
    { id: "python", label: "Python", icon: "🐍" },
    { id: "javascript", label: "JavaScript", icon: "🟨" },
    { id: "cpp", label: "C++", icon: "⚙️" },
    { id: "java", label: "Java", icon: "☕" },
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
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const resp = await apiClient.getExecutionHistory(15);
            setHistory(resp.executions);
        } catch (err) {
            console.error("Failed to load history:", err);
        }
    };

    const handleRun = async () => {
        if (!code.trim() || isRunning) return;
        setIsRunning(true);
        setResult(null);
        setDiagnostic(null);
        setActiveTab("stdout");

        try {
            const resp = await apiClient.executeCode({
                code: code.trim(),
                language,
                stdin: stdin.trim() || undefined,
            });
            setResult(resp);
            if (resp.status === "error" || resp.status === "timeout") {
                setActiveTab("stderr");
            }
            loadHistory();
        } catch (err) {
            setResult({
                id: 0,
                language,
                status: "error",
                stderr: err instanceof Error ? err.message : "Unknown error",
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
            const resp = await apiClient.diagnoseExecution(result.id);
            setDiagnostic(resp.diagnostic);
        } catch (err) {
            setDiagnostic("Failed to get diagnosis. Please try again.");
        } finally {
            setIsDiagnosing(false);
        }
    };

    const loadExecution = (exec: ExecuteResponse) => {
        setResult(exec);
        setActiveTab(exec.status === "success" ? "stdout" : "stderr");
        setDiagnostic(null);
    };

    const statusStyle = result ? STATUS_STYLES[result.status] || STATUS_STYLES.pending : null;

    const handleEditorMount = (editor: any, monacoInstance: any) => {
        // Ctrl+Enter to run
        editor.addCommand(
            monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
            () => handleRun()
        );
    };

    return (
        <div className="flex h-[calc(100vh-3.5rem)] bg-[#0B0F0E]">
            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#1F2D28] bg-[#111917]">
                    <div className="flex items-center gap-3">
                        {/* Language Selector */}
                        <div className="flex items-center gap-1 bg-[#1A2420] rounded-xl border border-[#1F2D28] p-1">
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang.id}
                                    onClick={() => setLanguage(lang.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        language === lang.id
                                            ? "bg-[#2EFF7B]/15 text-[#2EFF7B] border border-[#2EFF7B]/30"
                                            : "text-[#8FAEA2] hover:text-[#E6F1EC] hover:bg-[#1F2D28]"
                                    }`}
                                >
                                    <span>{lang.icon}</span>
                                    <span>{lang.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className={`p-2 rounded-lg text-sm transition-colors ${
                                showHistory ? "bg-[#2EFF7B]/15 text-[#2EFF7B]" : "text-[#5A7268] hover:text-[#E6F1EC]"
                            }`}
                            title="Toggle history"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </button>
                        <button
                            onClick={handleRun}
                            disabled={isRunning || !code.trim()}
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                                isRunning
                                    ? "bg-amber-500/20 text-amber-400 cursor-wait"
                                    : "bg-[#2EFF7B] hover:bg-[#1ED760] text-[#0B0F0E] hover:shadow-lg hover:shadow-[#2EFF7B]/20"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title="Run code (Ctrl+Enter)"
                        >
                            {isRunning ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Running...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                    Run
                                    <kbd className="text-[10px] px-1 py-0.5 bg-[#0B0F0E]/30 rounded ml-1 font-mono opacity-70">⌘↵</kbd>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Code Editor — now using Monaco */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 overflow-hidden">
                        <Editor
                            height="100%"
                            language={LANG_MONACO_MAP[language] || "plaintext"}
                            value={code}
                            theme="vs-dark"
                            onChange={(v) => setCode(v || "")}
                            onMount={handleEditorMount}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                                fontLigatures: true,
                                wordWrap: 'on',
                                padding: { top: 16, bottom: 16 },
                                scrollBeyondLastLine: false,
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                cursorSmoothCaretAnimation: 'on',
                                formatOnPaste: true,
                                bracketPairColorization: { enabled: true },
                                guides: { bracketPairs: true, indentation: true },
                            }}
                            loading={
                                <div className="h-full w-full flex items-center justify-center text-[#5A7268]">
                                    Loading Editor...
                                </div>
                            }
                        />
                    </div>

                    {/* Stdin Input */}
                    <div className="border-t border-[#1F2D28]">
                        <div className="flex items-center px-4 py-2 bg-[#111917]">
                            <span className="text-xs text-[#5A7268] mr-2">stdin:</span>
                            <input
                                type="text"
                                value={stdin}
                                onChange={(e) => setStdin(e.target.value)}
                                placeholder="Optional input (stdin)..."
                                className="flex-1 bg-transparent text-[#E6F1EC] text-sm font-mono focus:outline-none placeholder-[#3A4F46]"
                            />
                        </div>
                    </div>

                    {/* Output Panel */}
                    <div className="border-t border-[#1F2D28] bg-[#111917] min-h-[200px] max-h-[350px] flex flex-col">
                        {/* Output Tabs + Metrics */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1F2D28]">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setActiveTab("stdout")}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                        activeTab === "stdout"
                                            ? "bg-[#2EFF7B]/15 text-[#2EFF7B]"
                                            : "text-[#5A7268] hover:text-[#E6F1EC]"
                                    }`}
                                >
                                    stdout
                                </button>
                                <button
                                    onClick={() => setActiveTab("stderr")}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                        activeTab === "stderr"
                                            ? "bg-red-500/15 text-red-400"
                                            : "text-[#5A7268] hover:text-[#E6F1EC]"
                                    }`}
                                >
                                    stderr
                                    {result?.stderr && (
                                        <span className="ml-1 w-1.5 h-1.5 inline-block rounded-full bg-red-400"></span>
                                    )}
                                </button>
                            </div>

                            {result && (
                                <div className="flex items-center gap-3 text-xs">
                                    {statusStyle && (
                                        <span className={`px-2 py-0.5 rounded-md ${statusStyle.bg} ${statusStyle.text} font-medium`}>
                                            {statusStyle.label}
                                        </span>
                                    )}
                                    {result.exit_code !== undefined && result.exit_code !== null && (
                                        <span className="text-[#5A7268]">
                                            exit: <span className="text-[#8FAEA2]">{result.exit_code}</span>
                                        </span>
                                    )}
                                    {result.execution_time_ms !== undefined && (
                                        <span className="text-[#5A7268]">
                                            ⏱ <span className="text-[#8FAEA2]">{result.execution_time_ms}ms</span>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Output Content */}
                        <div className="flex-1 overflow-auto p-4">
                            {isRunning ? (
                                <div className="flex items-center gap-2 text-[#5A7268] text-sm">
                                    <div className="flex gap-1">
                                        <span className="w-2 h-2 bg-[#2EFF7B] rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                        <span className="w-2 h-2 bg-[#2EFF7B] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                        <span className="w-2 h-2 bg-[#2EFF7B] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                                    </div>
                                    Executing...
                                </div>
                            ) : result ? (
                                <pre className="text-sm font-mono text-[#E6F1EC] whitespace-pre-wrap break-words">
                                    {activeTab === "stdout"
                                        ? result.stdout || "(no output)"
                                        : result.stderr || "(no errors)"}
                                </pre>
                            ) : (
                                <p className="text-sm text-[#3A4F46] italic">
                                    Press <kbd className="px-1.5 py-0.5 bg-[#1A2420] border border-[#1F2D28] rounded text-[#5A7268] text-xs">Ctrl+Enter</kbd> or click <strong className="text-[#5A7268]">Run</strong> to execute your code
                                </p>
                            )}
                        </div>

                        {/* Diagnose Button */}
                        {result && (result.status === "error" || result.status === "timeout") && (
                            <div className="px-4 py-2 border-t border-[#1F2D28]">
                                {diagnostic ? (
                                    <div className="bg-[#1A2420] border border-[#1F2D28] rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs font-semibold text-amber-400">🔍 AI Diagnosis</span>
                                        </div>
                                        <pre className="text-xs font-mono text-[#E6F1EC] whitespace-pre-wrap">{diagnostic}</pre>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleDiagnose}
                                        disabled={isDiagnosing}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                    >
                                        {isDiagnosing ? (
                                            <>
                                                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                Diagnosing...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                                Diagnose Error with AI
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* History Sidebar */}
            {showHistory && (
                <div className="w-72 border-l border-[#1F2D28] bg-[#111917] flex flex-col">
                    <div className="px-4 py-3 border-b border-[#1F2D28]">
                        <h3 className="text-sm font-semibold text-[#E6F1EC]">Execution History</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {history.length === 0 ? (
                            <p className="p-4 text-xs text-[#3A4F46] italic">No executions yet</p>
                        ) : (
                            history.map((exec) => {
                                const st = STATUS_STYLES[exec.status] || STATUS_STYLES.pending;
                                const lang = LANGUAGES.find((l) => l.id === exec.language);
                                const time = new Date(exec.created_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                });
                                return (
                                    <button
                                        key={exec.id}
                                        onClick={() => loadExecution(exec)}
                                        className={`w-full text-left px-4 py-3 border-b border-[#1F2D28] hover:bg-[#1A2420] transition-colors ${
                                            result?.id === exec.id ? "bg-[#1A2420]" : ""
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs">{lang?.icon || "📄"}</span>
                                                <span className="text-xs text-[#8FAEA2] font-medium">{lang?.label || exec.language}</span>
                                            </div>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.bg} ${st.text}`}>{st.label}</span>
                                        </div>
                                        <p className="text-[11px] text-[#5A7268] font-mono truncate">
                                            {exec.stdout?.substring(0, 40) || exec.stderr?.substring(0, 40) || "(no output)"}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 text-[10px] text-[#3A4F46]">
                                            <span>{time}</span>
                                            {exec.execution_time_ms !== undefined && <span>{exec.execution_time_ms}ms</span>}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
