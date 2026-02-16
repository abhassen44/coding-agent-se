"use client";

import React, { useState, useRef, useCallback } from "react";

interface FileUploadProps {
    onFileSelect: (files: File[]) => void;
    multiple?: boolean;
    accept?: string;
    maxSize?: number;
    disabled?: boolean;
}

export default function FileUpload({
    onFileSelect,
    multiple = true,
    accept = ".py,.js,.ts,.tsx,.jsx,.java,.cpp,.c,.h,.go,.rs,.rb,.php,.html,.css,.json,.md,.txt",
    maxSize = 10,
    disabled = false,
}: FileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const validateFiles = (files: File[]): File[] => {
        const validFiles: File[] = [];
        const maxBytes = maxSize * 1024 * 1024;
        for (const file of files) {
            if (file.size > maxBytes) {
                setError(`${file.name} exceeds ${maxSize}MB`);
                continue;
            }
            validFiles.push(file);
        }
        return validFiles;
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        setError(null);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files);
        const validFiles = validateFiles(files);
        if (validFiles.length > 0) {
            setSelectedFiles(prev => multiple ? [...prev, ...validFiles] : validFiles);
            onFileSelect(validFiles);
        }
    }, [disabled, multiple, onFileSelect, maxSize]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        const files = Array.from(e.target.files || []);
        const validFiles = validateFiles(files);
        if (validFiles.length > 0) {
            setSelectedFiles(prev => multiple ? [...prev, ...validFiles] : validFiles);
            onFileSelect(validFiles);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const getFileIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const icons: Record<string, string> = {
            py: "🐍", js: "JS", ts: "TS", tsx: "⚛", jsx: "⚛",
            java: "☕", cpp: "C+", c: "C", go: "Go", rs: "🦀", md: "📝", json: "{}"
        };
        return icons[ext || ""] || "📄";
    };

    return (
        <div className="w-full max-w-full overflow-hidden">
            {/* Drop Zone */}
            <div
                onClick={() => !disabled && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`cursor-pointer rounded-xl border-2 border-dashed transition-all ${isDragging
                        ? "border-[#2EFF7B] bg-[#2EFF7B]/5"
                        : disabled
                            ? "border-[#1F2D28] bg-[#111917]/50 cursor-not-allowed"
                            : "border-[#1F2D28] hover:border-[#2EFF7B]/50 hover:bg-[#111917]"
                    }`}
            >
                <div className="p-8 text-center">
                    {/* Icon */}
                    <div className={`mx-auto w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${isDragging ? "bg-[#2EFF7B]/10" : "bg-[#111917]"
                        }`}>
                        <svg className={`w-7 h-7 ${isDragging ? "text-[#2EFF7B]" : "text-[#5A7268]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </div>

                    <p className="text-base font-medium text-[#E6F1EC] mb-1">
                        {isDragging ? "Drop files here" : "Drag & drop files"}
                    </p>
                    <p className="text-sm text-[#5A7268]">
                        or <span className="text-[#2EFF7B]">browse</span>
                    </p>

                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                        {["Python", "JS", "TS", "Java", "C++"].map((l) => (
                            <span key={l} className="px-2 py-0.5 text-xs bg-[#1A2420] text-[#5A7268] rounded">{l}</span>
                        ))}
                    </div>
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    multiple={multiple}
                    accept={accept}
                    onChange={handleFileInput}
                    className="hidden"
                    disabled={disabled}
                />
            </div>

            {/* Error */}
            {error && (
                <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-[#8FAEA2]">Files ({selectedFiles.length})</span>
                        <button onClick={() => setSelectedFiles([])} className="text-xs text-[#5A7268] hover:text-red-400">
                            Clear
                        </button>
                    </div>

                    {selectedFiles.map((file, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-[#111917] border border-[#1F2D28] rounded-xl group">
                            <div className="w-9 h-9 rounded-lg bg-[#1A2420] flex items-center justify-center text-sm text-[#2EFF7B]">
                                {getFileIcon(file.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-[#E6F1EC] truncate">{file.name}</p>
                                <p className="text-xs text-[#5A7268]">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button
                                onClick={() => removeFile(i)}
                                className="p-1.5 text-[#5A7268] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
