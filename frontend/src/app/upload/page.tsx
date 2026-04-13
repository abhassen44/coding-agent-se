"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FolderGit2, Github, Upload as UploadIcon } from "lucide-react";
import { getStoredAuthToken } from "@/lib/auth";

interface UploadedFile {
    id: number;
    name: string;
    size: number;
    language?: string;
    status: "uploading" | "success" | "error";
    error?: string;
}

interface Repository {
    id: number;
    name: string;
    description?: string;
}

interface ImportProgress {
    percent: number;
    message: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function UploadPage() {
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [selectedRepo, setSelectedRepo] = useState<number | null>(null);
    const [newRepoName, setNewRepoName] = useState("");
    const [newRepoDesc, setNewRepoDesc] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [githubUrl, setGithubUrl] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchRepositories = useCallback(async () => {
        const token = getStoredAuthToken();
        if (!token) return;

        try {
            const response = await fetch(`${API_BASE}/repo`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                setRepositories(data.repositories || []);
            }
        } catch (error) {
            console.error("Failed to fetch repositories:", error);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadRepositories = async () => {
            const token = getStoredAuthToken();
            if (!token) return;

            try {
                const response = await fetch(`${API_BASE}/repo`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.ok) return;
                const data = await response.json();
                if (!cancelled) {
                    setRepositories(data.repositories || []);
                }
            } catch (error) {
                console.error("Failed to fetch repositories:", error);
            }
        };

        void loadRepositories();

        return () => {
            cancelled = true;
        };
    }, []);

    const createRepository = async () => {
        const token = getStoredAuthToken();
        if (!token || !newRepoName.trim()) return;

        try {
            const response = await fetch(`${API_BASE}/repo`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: newRepoName.trim(),
                    description: newRepoDesc.trim() || null,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setRepositories((current) => [...current, data]);
                setSelectedRepo(data.id);
                setNewRepoName("");
                setNewRepoDesc("");
            }
        } catch (error) {
            console.error("Failed to create repository:", error);
        }
    };

    const uploadFile = useCallback(async (file: File) => {
        const token = getStoredAuthToken();
        if (!token) return;

        const tempId = Date.now() + Math.floor(Math.random() * 1000);
        setFiles((current) => [...current, { id: tempId, name: file.name, size: file.size, status: "uploading" }]);

        try {
            const formData = new FormData();
            formData.append("file", file);
            if (selectedRepo) {
                formData.append("repository_id", String(selectedRepo));
            }

            const response = await fetch(`${API_BASE}/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                setFiles((current) =>
                    current.map((entry) =>
                        entry.id === tempId
                            ? {
                                  ...entry,
                                  id: data.file.id,
                                  status: "success",
                                  language: data.file.language,
                              }
                            : entry,
                    ),
                );
            } else {
                const error = await response.json().catch(() => ({}));
                setFiles((current) =>
                    current.map((entry) =>
                        entry.id === tempId
                            ? {
                                  ...entry,
                                  status: "error",
                                  error: error.detail || "Upload failed",
                              }
                            : entry,
                    ),
                );
            }
        } catch {
            setFiles((current) =>
                current.map((entry) =>
                    entry.id === tempId
                        ? {
                              ...entry,
                              status: "error",
                              error: "Network error",
                          }
                        : entry,
                ),
            );
        }
    }, [selectedRepo]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        Array.from(event.target.files || []).forEach(uploadFile);
    };

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        Array.from(event.dataTransfer.files).forEach(uploadFile);
    }, [uploadFile]);

    const pollProgress = useCallback(async (repoId: number) => {
        const token = getStoredAuthToken();
        if (!token) return;

        const interval = window.setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE}/repo/import/progress/${repoId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.ok) return;
                const data = await response.json();
                setImportProgress({ percent: data.percent || 0, message: data.message || "" });

                if (data.status === "complete" || data.status === "error") {
                    window.clearInterval(interval);
                    setIsImporting(false);

                    if (data.status === "complete") {
                        setImportStatus("Repository imported successfully.");
                        setGithubUrl("");
                        fetchRepositories();
                        setSelectedRepo(repoId);
                    } else {
                        setImportStatus(`Error: ${data.message || "Import failed"}`);
                    }
                }
            } catch (error) {
                console.error("Progress poll error", error);
            }
        }, 1000);
    }, [fetchRepositories]);

    const handleGitHubImport = async () => {
        const token = getStoredAuthToken();
        if (!token || !githubUrl.trim()) return;

        setIsImporting(true);
        setImportStatus("Initializing import...");
        setImportProgress({ percent: 0, message: "Starting..." });

        try {
            const response = await fetch(`${API_BASE}/repo/import`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ url: githubUrl.trim(), branch: "main" }),
            });

            if (response.ok) {
                const data = await response.json();
                pollProgress(data.id);
            } else {
                const error = await response.json().catch(() => ({}));
                setImportStatus(`Error: ${error.detail || "Import failed"}`);
                setIsImporting(false);
                setImportProgress(null);
            }
        } catch {
            setImportStatus("Error: Failed to import");
            setIsImporting(false);
            setImportProgress(null);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="min-h-screen bg-[#0B0F0E] p-6">
            <div className="mx-auto max-w-5xl">
                <div className="mb-8">
                    <h1 className="mb-2 text-3xl font-bold text-[#E6F1EC]">Upload Files</h1>
                    <p className="text-[#5A7268]">Upload code files or import a GitHub repository for RAG-powered search.</p>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="rounded-2xl border border-[#1F2D28] bg-[#111917] p-5">
                        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#E6F1EC]">
                            <FolderGit2 className="h-5 w-5 text-[#2EFF7B]" />
                            Repository
                        </h2>
                        <select
                            value={selectedRepo || ""}
                            onChange={(event) => setSelectedRepo(event.target.value ? Number(event.target.value) : null)}
                            className="mb-4 w-full rounded-xl border border-[#1F2D28] bg-[#1A2420] px-4 py-3 text-sm text-[#E6F1EC] focus:border-[#2EFF7B] focus:outline-none"
                        >
                            <option value="">No repository</option>
                            {repositories.map((repo) => (
                                <option key={repo.id} value={repo.id}>
                                    {repo.name}
                                </option>
                            ))}
                        </select>

                        <div className="border-t border-[#1F2D28] pt-4">
                            <p className="mb-3 text-xs text-[#5A7268]">Or create a new repository</p>
                            <input
                                type="text"
                                placeholder="Repository name"
                                value={newRepoName}
                                onChange={(event) => setNewRepoName(event.target.value)}
                                className="mb-2 w-full rounded-lg border border-[#1F2D28] bg-[#1A2420] px-3 py-2 text-sm text-[#E6F1EC] placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none"
                            />
                            <input
                                type="text"
                                placeholder="Description (optional)"
                                value={newRepoDesc}
                                onChange={(event) => setNewRepoDesc(event.target.value)}
                                className="mb-3 w-full rounded-lg border border-[#1F2D28] bg-[#1A2420] px-3 py-2 text-sm text-[#E6F1EC] placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none"
                            />
                            <button
                                onClick={createRepository}
                                disabled={!newRepoName.trim()}
                                className="w-full rounded-xl bg-[#2EFF7B] py-2.5 font-medium text-[#0B0F0E] transition-colors hover:bg-[#1ED760] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Create
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[#1F2D28] bg-[#111917] p-5">
                        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#E6F1EC]">
                            <UploadIcon className="h-5 w-5 text-[#2EFF7B]" />
                            Upload Files
                        </h2>
                        <div
                            className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                                isDragging ? "border-[#2EFF7B] bg-[#2EFF7B]/5" : "border-[#1F2D28] hover:border-[#2EFF7B]/50"
                            }`}
                            onDrop={handleDrop}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#1A2420]">
                                <UploadIcon className={`h-6 w-6 ${isDragging ? "text-[#2EFF7B]" : "text-[#5A7268]"}`} />
                            </div>
                            <p className="mb-1 text-sm text-[#E6F1EC]">Drag and drop files</p>
                            <p className="text-xs text-[#5A7268]">or click to browse</p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
                            accept=".py,.js,.ts,.tsx,.jsx,.java,.cpp,.c,.go,.rs,.md,.json,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp"
                        />
                    </div>

                    <div className="rounded-2xl border border-[#1F2D28] bg-[#111917] p-5">
                        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#E6F1EC]">
                            <Github className="h-5 w-5 text-[#2EFF7B]" />
                            Import GitHub
                        </h2>
                        <input
                            type="text"
                            placeholder="https://github.com/user/repo"
                            value={githubUrl}
                            onChange={(event) => setGithubUrl(event.target.value)}
                            className="mb-3 w-full rounded-xl border border-[#1F2D28] bg-[#1A2420] px-4 py-3 text-sm text-[#E6F1EC] placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none"
                        />
                        <button
                            onClick={handleGitHubImport}
                            disabled={isImporting || !githubUrl.trim()}
                            className="w-full rounded-xl bg-[#2EFF7B] py-2.5 font-medium text-[#0B0F0E] transition-colors hover:bg-[#1ED760] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isImporting ? "Importing..." : "Import"}
                        </button>

                        {importProgress && isImporting ? (
                            <div className="mt-4">
                                <div className="mb-1 flex justify-between text-xs">
                                    <span className="text-[#E6F1EC]">{importProgress.message}</span>
                                    <span className="text-[#2EFF7B]">{importProgress.percent}%</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1A2420]">
                                    <div
                                        className="h-1.5 rounded-full bg-[#2EFF7B] transition-all duration-300 ease-out"
                                        style={{ width: `${importProgress.percent}%` }}
                                    />
                                </div>
                            </div>
                        ) : null}

                        {importStatus && !isImporting ? (
                            <p className={`mt-3 rounded-lg p-2 text-xs ${importStatus.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-[#2EFF7B]/10 text-[#2EFF7B]"}`}>
                                {importStatus}
                            </p>
                        ) : null}
                    </div>
                </div>

                {files.length > 0 ? (
                    <div className="rounded-2xl border border-[#1F2D28] bg-[#111917] p-5">
                        <h2 className="mb-4 text-lg font-semibold text-[#E6F1EC]">Uploaded Files</h2>
                        <div className="space-y-2">
                            {files.map((file) => (
                                <div
                                    key={file.id}
                                    className={`flex items-center gap-3 rounded-xl p-3 ${
                                        file.status === "error" ? "border border-red-500/30 bg-red-500/10" : "bg-[#1A2420]"
                                    }`}
                                >
                                    <span className="text-sm text-[#E6F1EC]">
                                        {file.status === "uploading" ? "Uploading" : file.status === "success" ? "Done" : "Error"}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-[#E6F1EC]">{file.name}</p>
                                        <p className="text-xs text-[#5A7268]">
                                            {formatSize(file.size)}
                                            {file.language ? ` - ${file.language}` : ""}
                                        </p>
                                    </div>
                                    {file.error ? <span className="text-xs text-red-400">{file.error}</span> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
