"use client";

import React, { useCallback, useRef, useState } from "react";

interface FileUploadProps {
    onFileSelect: (files: File[]) => void;
    multiple?: boolean;
    accept?: string;
    maxSize?: number;
    disabled?: boolean;
}

const FILE_ICON_MAP: Record<string, string> = {
    py: "PY",
    js: "JS",
    ts: "TS",
    tsx: "TSX",
    jsx: "JSX",
    java: "JV",
    cpp: "C++",
    c: "C",
    go: "GO",
    rs: "RS",
    md: "MD",
    json: "{}",
};

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

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
    }, []);

    const validateFiles = useCallback((files: File[]) => {
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
    }, [maxSize]);

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        setError(null);
        if (disabled) return;

        const files = Array.from(event.dataTransfer.files);
        const validFiles = validateFiles(files);
        if (validFiles.length > 0) {
            setSelectedFiles((current) => (multiple ? [...current, ...validFiles] : validFiles));
            onFileSelect(validFiles);
        }
    }, [disabled, multiple, onFileSelect, validateFiles]);

    const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        const files = Array.from(event.target.files || []);
        const validFiles = validateFiles(files);
        if (validFiles.length > 0) {
            setSelectedFiles((current) => (multiple ? [...current, ...validFiles] : validFiles));
            onFileSelect(validFiles);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    };

    const getFileIcon = (fileName: string) => {
        const extension = fileName.split(".").pop()?.toLowerCase();
        return FILE_ICON_MAP[extension || ""] || "FILE";
    };

    return (
        <div className="w-full max-w-full overflow-hidden">
            <div
                onClick={() => !disabled && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`cursor-pointer rounded-xl border-2 border-dashed transition-all ${
                    isDragging
                        ? "border-[#2EFF7B] bg-[#2EFF7B]/5"
                        : disabled
                            ? "cursor-not-allowed border-[#1F2D28] bg-[#111917]/50"
                            : "border-[#1F2D28] hover:border-[#2EFF7B]/50 hover:bg-[#111917]"
                }`}
            >
                <div className="p-8 text-center">
                    <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl ${isDragging ? "bg-[#2EFF7B]/10" : "bg-[#111917]"}`}>
                        <svg className={`h-7 w-7 ${isDragging ? "text-[#2EFF7B]" : "text-[#5A7268]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </div>

                    <p className="mb-1 text-base font-medium text-[#E6F1EC]">{isDragging ? "Drop files here" : "Drag and drop files"}</p>
                    <p className="text-sm text-[#5A7268]">
                        or <span className="text-[#2EFF7B]">browse</span>
                    </p>

                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                        {["Python", "JS", "TS", "Java", "C++"].map((label) => (
                            <span key={label} className="rounded bg-[#1A2420] px-2 py-0.5 text-xs text-[#5A7268]">
                                {label}
                            </span>
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

            {error ? (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
            ) : null}

            {selectedFiles.length > 0 ? (
                <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-[#8FAEA2]">Files ({selectedFiles.length})</span>
                        <button onClick={() => setSelectedFiles([])} className="text-xs text-[#5A7268] hover:text-red-400">
                            Clear
                        </button>
                    </div>

                    {selectedFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="group flex items-center gap-3 rounded-xl border border-[#1F2D28] bg-[#111917] p-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1A2420] text-[11px] font-semibold text-[#2EFF7B]">
                                {getFileIcon(file.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-[#E6F1EC]">{file.name}</p>
                                <p className="text-xs text-[#5A7268]">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button
                                onClick={() => removeFile(index)}
                                className="p-1.5 text-[#5A7268] opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
