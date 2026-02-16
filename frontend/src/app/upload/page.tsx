'use client';

import React, { useState, useRef, useCallback } from 'react';

interface UploadedFile {
    id: number;
    name: string;
    size: number;
    language?: string;
    status: 'uploading' | 'success' | 'error';
    error?: string;
}

interface Repository {
    id: number;
    name: string;
    description?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function UploadPage() {
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [selectedRepo, setSelectedRepo] = useState<number | null>(null);
    const [newRepoName, setNewRepoName] = useState('');
    const [newRepoDesc, setNewRepoDesc] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [githubUrl, setGithubUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

    React.useEffect(() => { fetchRepositories(); }, []);

    const fetchRepositories = async () => {
        const token = getToken();
        if (!token) return;
        try {
            const response = await fetch(`${API_BASE}/repo`, { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) {
                const data = await response.json();
                setRepositories(data.repositories || []);
            }
        } catch (err) { console.error('Failed to fetch repositories:', err); }
    };

    const createRepository = async () => {
        const token = getToken();
        if (!token || !newRepoName.trim()) return;
        try {
            const response = await fetch(`${API_BASE}/repo`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newRepoName.trim(), description: newRepoDesc.trim() || null }),
            });
            if (response.ok) {
                const data = await response.json();
                setRepositories((prev) => [...prev, data]);
                setSelectedRepo(data.id);
                setNewRepoName('');
                setNewRepoDesc('');
            }
        } catch (err) { console.error('Failed to create repository:', err); }
    };

    const uploadFile = async (file: File) => {
        const token = getToken();
        if (!token) return;
        const tempId = Date.now();
        setFiles((prev) => [...prev, { id: tempId, name: file.name, size: file.size, status: 'uploading' }]);

        try {
            const formData = new FormData();
            formData.append('file', file);
            if (selectedRepo) formData.append('repository_id', selectedRepo.toString());

            const response = await fetch(`${API_BASE}/files/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                setFiles((prev) => prev.map((f) => f.id === tempId ? { ...f, id: data.file.id, status: 'success', language: data.file.language } : f));
            } else {
                const error = await response.json();
                setFiles((prev) => prev.map((f) => f.id === tempId ? { ...f, status: 'error', error: error.detail || 'Upload failed' } : f));
            }
        } catch (err) {
            setFiles((prev) => prev.map((f) => f.id === tempId ? { ...f, status: 'error', error: 'Network error' } : f));
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        Array.from(e.target.files || []).forEach(uploadFile);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        Array.from(e.dataTransfer.files).forEach(uploadFile);
    }, [selectedRepo]);

    const handleGitHubImport = async () => {
        const token = getToken();
        if (!token || !githubUrl.trim()) return;
        setIsImporting(true);
        setImportStatus('Cloning repository...');

        try {
            const response = await fetch(`${API_BASE}/repo/import`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: githubUrl.trim(), branch: 'main' }),
            });

            if (response.ok) {
                setImportStatus('Repository imported!');
                setGithubUrl('');
                fetchRepositories();
            } else {
                const error = await response.json();
                setImportStatus(`Error: ${error.detail || 'Import failed'}`);
            }
        } catch (err) {
            setImportStatus('Error: Failed to import');
        } finally {
            setIsImporting(false);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="min-h-screen bg-[#0B0F0E] p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-[#E6F1EC] mb-2">Upload Files</h1>
                    <p className="text-[#5A7268]">Upload code files to index for RAG-powered search</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {/* Repository Selection */}
                    <div className="bg-[#111917] border border-[#1F2D28] rounded-2xl p-5">
                        <h2 className="text-lg font-semibold text-[#E6F1EC] mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-[#2EFF7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            Repository
                        </h2>
                        <select
                            value={selectedRepo || ''}
                            onChange={(e) => setSelectedRepo(e.target.value ? Number(e.target.value) : null)}
                            className="w-full px-4 py-3 bg-[#1A2420] border border-[#1F2D28] rounded-xl text-[#E6F1EC] text-sm focus:border-[#2EFF7B] focus:outline-none mb-4"
                        >
                            <option value="">No repository</option>
                            {repositories.map((repo) => (
                                <option key={repo.id} value={repo.id}>{repo.name}</option>
                            ))}
                        </select>

                        <div className="border-t border-[#1F2D28] pt-4">
                            <p className="text-xs text-[#5A7268] mb-3">Or create new</p>
                            <input
                                type="text"
                                placeholder="Repository name"
                                value={newRepoName}
                                onChange={(e) => setNewRepoName(e.target.value)}
                                className="w-full px-3 py-2 bg-[#1A2420] border border-[#1F2D28] rounded-lg text-[#E6F1EC] text-sm placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none mb-2"
                            />
                            <input
                                type="text"
                                placeholder="Description (optional)"
                                value={newRepoDesc}
                                onChange={(e) => setNewRepoDesc(e.target.value)}
                                className="w-full px-3 py-2 bg-[#1A2420] border border-[#1F2D28] rounded-lg text-[#E6F1EC] text-sm placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none mb-3"
                            />
                            <button
                                onClick={createRepository}
                                disabled={!newRepoName.trim()}
                                className="w-full py-2.5 bg-[#2EFF7B] text-[#0B0F0E] font-medium rounded-xl hover:bg-[#1ED760] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Create
                            </button>
                        </div>
                    </div>

                    {/* File Upload */}
                    <div className="bg-[#111917] border border-[#1F2D28] rounded-2xl p-5">
                        <h2 className="text-lg font-semibold text-[#E6F1EC] mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-[#2EFF7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Upload Files
                        </h2>
                        <div
                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging ? 'border-[#2EFF7B] bg-[#2EFF7B]/5' : 'border-[#1F2D28] hover:border-[#2EFF7B]/50'}`}
                            onDrop={handleDrop}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#1A2420] flex items-center justify-center">
                                <svg className={`w-6 h-6 ${isDragging ? 'text-[#2EFF7B]' : 'text-[#5A7268]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <p className="text-sm text-[#E6F1EC] mb-1">Drag & drop files</p>
                            <p className="text-xs text-[#5A7268]">or click to browse</p>
                        </div>
                        <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept=".py,.js,.ts,.tsx,.jsx,.java,.cpp,.c,.go,.rs,.md,.json,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp" />
                    </div>

                    {/* GitHub Import */}
                    <div className="bg-[#111917] border border-[#1F2D28] rounded-2xl p-5">
                        <h2 className="text-lg font-semibold text-[#E6F1EC] mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-[#2EFF7B]" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                            Import GitHub
                        </h2>
                        <input
                            type="text"
                            placeholder="https://github.com/user/repo"
                            value={githubUrl}
                            onChange={(e) => setGithubUrl(e.target.value)}
                            className="w-full px-4 py-3 bg-[#1A2420] border border-[#1F2D28] rounded-xl text-[#E6F1EC] text-sm placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none mb-3"
                        />
                        <button
                            onClick={handleGitHubImport}
                            disabled={isImporting || !githubUrl.trim()}
                            className="w-full py-2.5 bg-[#2EFF7B] text-[#0B0F0E] font-medium rounded-xl hover:bg-[#1ED760] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isImporting ? 'Importing...' : 'Import'}
                        </button>
                        {importStatus && (
                            <p className={`mt-3 text-xs p-2 rounded-lg ${importStatus.includes('Error') ? 'bg-red-500/10 text-red-400' : 'bg-[#2EFF7B]/10 text-[#2EFF7B]'}`}>
                                {importStatus}
                            </p>
                        )}
                    </div>
                </div>

                {/* Uploaded Files */}
                {files.length > 0 && (
                    <div className="bg-[#111917] border border-[#1F2D28] rounded-2xl p-5">
                        <h2 className="text-lg font-semibold text-[#E6F1EC] mb-4">Uploaded Files</h2>
                        <div className="space-y-2">
                            {files.map((file) => (
                                <div key={file.id} className={`flex items-center gap-3 p-3 rounded-xl ${file.status === 'error' ? 'bg-red-500/10 border border-red-500/30' : 'bg-[#1A2420]'}`}>
                                    <span className="text-lg">
                                        {file.status === 'uploading' ? '⏳' : file.status === 'success' ? '✓' : '✕'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-[#E6F1EC] truncate">{file.name}</p>
                                        <p className="text-xs text-[#5A7268]">{formatSize(file.size)}{file.language && ` • ${file.language}`}</p>
                                    </div>
                                    {file.error && <span className="text-xs text-red-400">{file.error}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
