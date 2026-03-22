import React, { useState } from 'react';
import { 
    ChevronRight, 
    ChevronDown, 
    FileIcon, 
    FolderIcon, 
    FileText, 
    FileCode,
    FileJson,
    Image as ImageIcon,
    MoreVertical,
    FilePlus,
    FolderPlus,
    Trash2
} from 'lucide-react';
import { FileNode } from '@/lib/api';

interface FileExplorerProps {
    entries: FileNode[];
    onFileSelect: (file: FileNode) => void;
    selectedPath?: string;
    onCreateFile?: (path: string, isDir: boolean) => void;
    onDelete?: (path: string) => void;
    currentPath: string;
    // New: fetch children for a directory path
    onFetchChildren?: (path: string) => Promise<FileNode[]>;
}

const HIDDEN_NAMES = new Set(['.git', '.DS_Store', '__pycache__', 'node_modules']);

const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'js': case 'ts': case 'jsx': case 'tsx':
        case 'py': case 'html': case 'css': case 'java':
        case 'cpp': case 'c': case 'go': case 'rs':
        case 'sh': case 'rb': case 'php':
            return <FileCode className="w-4 h-4 text-[#2EFF7B]" />;
        case 'json':
            return <FileJson className="w-4 h-4 text-[#E6CD69]" />;
        case 'png': case 'jpg': case 'svg': case 'gif': case 'webp':
            return <ImageIcon className="w-4 h-4 text-[#69E6E6]" />;
        case 'md': case 'txt': case 'log':
            return <FileText className="w-4 h-4 text-[#8FAEA2]" />;
        default:
            return <FileIcon className="w-4 h-4 text-[#8FAEA2]" />;
    }
};

const FileTreeItem: React.FC<{
    node: FileNode;
    level: number;
    onSelect: (node: FileNode) => void;
    selectedPath?: string;
    onCreateClick: (path: string, isDir: boolean) => void;
    onDeleteClick: (path: string) => void;
    onFetchChildren?: (path: string) => Promise<FileNode[]>;
}> = ({ node, level, onSelect, selectedPath, onCreateClick, onDeleteClick, onFetchChildren }) => {
    const isSelected = selectedPath === node.path;
    const [isHovered, setIsHovered] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [children, setChildren] = useState<FileNode[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = async () => {
        if (node.type === 'dir') {
            if (!isExpanded && onFetchChildren && !children) {
                setIsLoading(true);
                try {
                    const kids = await onFetchChildren(node.path);
                    setChildren(kids);
                } catch (err) {
                    console.error('Failed to fetch children:', err);
                }
                setIsLoading(false);
            }
            setIsExpanded(!isExpanded);
        } else {
            onSelect(node);
        }
    };

    // Sort children: dirs first, then alphabetical
    const sortedChildren = children
        ? [...children]
              .filter(c => !HIDDEN_NAMES.has(c.name))
              .sort((a, b) => {
                  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                  return a.name.localeCompare(b.name);
              })
        : [];

    return (
        <div className="select-none">
            <div
                className={`flex items-center group cursor-pointer hover:bg-[#1A2420] transition-colors py-1 px-2 ${isSelected ? 'bg-[#2EFF7B]/10 text-[#2EFF7B]' : 'text-[#E6F1EC]'}`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => { setIsHovered(false); setShowMenu(false); }}
            >
                {node.type === 'dir' ? (
                    <span className="w-4 h-4 mr-1 text-[#8FAEA2] flex items-center justify-center shrink-0">
                        {isLoading ? (
                            <span className="w-3 h-3 border border-[#5A7268] border-t-transparent rounded-full animate-spin" />
                        ) : isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                        )}
                    </span>
                ) : (
                    <span className="w-4 h-4 mr-1 shrink-0" />
                )}
                
                <span className="w-4 h-4 mr-2 flex items-center justify-center shrink-0">
                    {node.type === 'dir' ? (
                        <FolderIcon className={`w-4 h-4 ${isExpanded ? 'text-[#2EFF7B]' : 'text-[#8FAEA2]'}`} strokeWidth={1.5} />
                    ) : (
                        getFileIcon(node.name)
                    )}
                </span>
                
                <span className="flex-1 text-sm truncate">{node.name}</span>
                
                {node.size !== undefined && node.size !== null && node.type !== 'dir' && (
                    <span className="text-[10px] text-[#3A4F46] mr-2 shrink-0 hidden group-hover:inline">
                        {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}K`}
                    </span>
                )}

                {isHovered && (
                    <div className="relative flex items-center space-x-1 pr-1" onClick={e => e.stopPropagation()}>
                        <button 
                            className="p-1 hover:bg-[#111917] rounded text-[#8FAEA2] hover:text-[#2EFF7B]"
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        >
                            <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                        
                        {showMenu && (
                            <div className="absolute right-0 top-6 bg-[#111917] border border-[#1F2D28] rounded-lg shadow-xl z-50 overflow-hidden py-1 w-36">
                                {node.type === 'dir' && (
                                    <>
                                        <button 
                                            className="w-full text-left px-3 py-1.5 text-xs text-[#E6F1EC] hover:bg-[#1A2420] flex items-center gap-2"
                                            onClick={() => { setShowMenu(false); onCreateClick(node.path, false); }}
                                        >
                                            <FilePlus className="w-3.5 h-3.5" /> New File
                                        </button>
                                        <button 
                                            className="w-full text-left px-3 py-1.5 text-xs text-[#E6F1EC] hover:bg-[#1A2420] flex items-center gap-2"
                                            onClick={() => { setShowMenu(false); onCreateClick(node.path, true); }}
                                        >
                                            <FolderPlus className="w-3.5 h-3.5" /> New Folder
                                        </button>
                                        <div className="my-1 border-t border-[#1F2D28]"></div>
                                    </>
                                )}
                                <button 
                                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-[#1A2420] flex items-center gap-2"
                                    onClick={() => { setShowMenu(false); onDeleteClick(node.path); }}
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Render children inline when expanded */}
            {isExpanded && sortedChildren.length > 0 && (
                <div>
                    {sortedChildren.map((child) => (
                        <FileTreeItem 
                            key={child.path}
                            node={child}
                            level={level + 1}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                            onCreateClick={onCreateClick}
                            onDeleteClick={onDeleteClick}
                            onFetchChildren={onFetchChildren}
                        />
                    ))}
                </div>
            )}
            
            {isExpanded && children && sortedChildren.length === 0 && (
                <div className="text-[10px] text-[#3A4F46] italic" style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}>
                    Empty
                </div>
            )}
        </div>
    );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({ 
    entries, 
    onFileSelect, 
    selectedPath,
    onCreateFile,
    onDelete,
    currentPath,
    onFetchChildren,
}) => {
    const handleCreateClick = (path: string, isDir: boolean) => {
        if (onCreateFile) onCreateFile(path, isDir);
    };

    const handleDeleteClick = (path: string) => {
        if (onDelete) onDelete(path);
    };

    // Filter hidden & sort: directories first, then alphabetical
    const sortedEntries = [...entries]
        .filter(e => !HIDDEN_NAMES.has(e.name))
        .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

    return (
        <div className="h-full flex flex-col bg-[#0B0F0E] border-r border-[#1F2D28] overflow-hidden select-none">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1F2D28]">
                <span className="text-xs font-semibold text-[#8FAEA2] uppercase tracking-wider">Explorer</span>
                <div className="flex space-x-1">
                    <button 
                        className="p-1 hover:bg-[#1A2420] text-[#8FAEA2] hover:text-[#2EFF7B] rounded"
                        title="New File"
                        onClick={() => handleCreateClick(currentPath, false)}
                    >
                        <FilePlus className="w-4 h-4" />
                    </button>
                    <button 
                        className="p-1 hover:bg-[#1A2420] text-[#8FAEA2] hover:text-[#2EFF7B] rounded"
                        title="New Folder"
                        onClick={() => handleCreateClick(currentPath, true)}
                    >
                        <FolderPlus className="w-4 h-4" />
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto py-1">
                {sortedEntries.length === 0 ? (
                    <div className="px-4 py-2 text-xs text-[#5A7268] italic">No files found</div>
                ) : (
                    sortedEntries.map((node) => (
                        <FileTreeItem 
                            key={node.path}
                            node={node}
                            level={0}
                            onSelect={onFileSelect}
                            selectedPath={selectedPath}
                            onCreateClick={handleCreateClick}
                            onDeleteClick={handleDeleteClick}
                            onFetchChildren={onFetchChildren}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
