'use client';

import React, { useState } from 'react';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    language?: string;
    size?: number;
}

interface FileTreeProps {
    files: FileNode[];
    onFileSelect: (file: FileNode) => void;
    selectedPath?: string;
}

const FILE_ICONS: Record<string, string> = {
    python: '🐍',
    javascript: '📜',
    typescript: '💎',
    java: '☕',
    cpp: 'C++',
    c: 'C',
    go: '🐹',
    rust: '🦀',
    ruby: '💎',
    php: '🐘',
    html: '🌐',
    css: '🎨',
    json: '{}',
    markdown: '📝',
    default: '📄',
    folder: '📁',
    folderOpen: '📂',
};

function getFileIcon(file: FileNode, isOpen: boolean = false): string {
    if (file.type === 'folder') {
        return isOpen ? FILE_ICONS.folderOpen : FILE_ICONS.folder;
    }
    return FILE_ICONS[file.language || 'default'] || FILE_ICONS.default;
}

interface TreeNodeProps {
    node: FileNode;
    depth: number;
    onSelect: (file: FileNode) => void;
    selectedPath?: string;
}

function TreeNode({ node, depth, onSelect, selectedPath }: TreeNodeProps) {
    const [isOpen, setIsOpen] = useState(false);
    const isSelected = node.path === selectedPath;
    const hasChildren = node.type === 'folder' && node.children && node.children.length > 0;

    const handleClick = () => {
        if (node.type === 'folder') {
            setIsOpen(!isOpen);
        } else {
            onSelect(node);
        }
    };

    return (
        <div className="file-tree-node">
            <div
                className={`file-tree-item ${isSelected ? 'selected' : ''}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={handleClick}
            >
                {hasChildren && (
                    <span className="tree-toggle">
                        {isOpen ? '▼' : '▶'}
                    </span>
                )}
                <span className="file-icon">{getFileIcon(node, isOpen)}</span>
                <span className="file-name">{node.name}</span>
                {node.size && <span className="file-size">{formatSize(node.size)}</span>}
            </div>
            {hasChildren && isOpen && (
                <div className="file-tree-children">
                    {node.children!.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function FileTree({ files, onFileSelect, selectedPath }: FileTreeProps) {
    return (
        <div className="file-tree">
            <div className="file-tree-header">
                <span className="file-tree-title">Files</span>
            </div>
            <div className="file-tree-content">
                {files.map((file) => (
                    <TreeNode
                        key={file.path}
                        node={file}
                        depth={0}
                        onSelect={onFileSelect}
                        selectedPath={selectedPath}
                    />
                ))}
                {files.length === 0 && (
                    <div className="file-tree-empty">
                        No files in this repository
                    </div>
                )}
            </div>
            <style jsx>{`
        .file-tree {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary, #1a1a2e);
          border-right: 1px solid var(--border-color, #2d2d44);
        }
        
        .file-tree-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color, #2d2d44);
          font-weight: 600;
          color: var(--text-primary, #fff);
        }
        
        .file-tree-content {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }
        
        .file-tree-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          cursor: pointer;
          color: var(--text-secondary, #b8b8d1);
          transition: background-color 0.15s ease;
        }
        
        .file-tree-item:hover {
          background: var(--bg-hover, #2d2d44);
          color: var(--text-primary, #fff);
        }
        
        .file-tree-item.selected {
          background: var(--primary-color, #6366f1);
          color: white;
        }
        
        .tree-toggle {
          font-size: 10px;
          width: 12px;
          color: var(--text-muted, #6b7280);
        }
        
        .file-icon {
          font-size: 14px;
        }
        
        .file-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
        }
        
        .file-size {
          font-size: 11px;
          color: var(--text-muted, #6b7280);
        }
        
        .file-tree-empty {
          padding: 16px;
          text-align: center;
          color: var(--text-muted, #6b7280);
          font-size: 13px;
        }
      `}</style>
        </div>
    );
}

export type { FileNode, FileTreeProps };
