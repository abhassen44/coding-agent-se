import React from 'react';
import { X, Circle, FileCode, FileJson, FileText, FileIcon, Image as ImageIcon } from 'lucide-react';

export interface EditorTab {
    path: string;
    isDirty: boolean;
}

interface EditorTabsProps {
    tabs: EditorTab[];
    activePath: string | null;
    onSelect: (path: string) => void;
    onClose: (path: string) => void;
}

const getTabIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'js': case 'ts': case 'jsx': case 'tsx':
        case 'py': case 'html': case 'css': case 'java':
        case 'cpp': case 'c': case 'go': case 'rs':
        case 'sh': case 'rb': case 'php':
            return <FileCode className="w-3.5 h-3.5 text-[#2EFF7B] shrink-0" />;
        case 'json':
            return <FileJson className="w-3.5 h-3.5 text-[#E6CD69] shrink-0" />;
        case 'png': case 'jpg': case 'svg': case 'gif': case 'webp':
            return <ImageIcon className="w-3.5 h-3.5 text-[#69E6E6] shrink-0" />;
        case 'md': case 'txt': case 'log':
            return <FileText className="w-3.5 h-3.5 text-[#8FAEA2] shrink-0" />;
        default:
            return <FileIcon className="w-3.5 h-3.5 text-[#5A7268] shrink-0" />;
    }
};

export const EditorTabs: React.FC<EditorTabsProps> = ({ tabs, activePath, onSelect, onClose }) => {
    return (
        <div className="flex bg-[#0B0F0E] border-b border-[#1F2D28] overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
                const isActive = tab.path === activePath;
                const filename = tab.path.split('/').pop() || tab.path;

                return (
                    <div
                        key={tab.path}
                        onClick={() => onSelect(tab.path)}
                        className={`flex items-center min-w-[120px] max-w-[200px] h-9 px-3 border-r border-[#1F2D28] cursor-pointer transition-colors select-none group ${
                            isActive 
                                ? 'bg-[#111917] border-t-2 border-t-[#2EFF7B] text-[#2EFF7B]' 
                                : 'bg-[#0B0F0E] text-[#8FAEA2] hover:bg-[#111917]'
                        }`}
                        title={tab.path}
                    >
                        {getTabIcon(filename)}
                        <span className="flex-1 text-sm truncate ml-2 mr-2">{filename}</span>
                        
                        <div 
                            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[#1A2420] text-[#5A7268] hover:text-[#E6F1EC]"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose(tab.path);
                            }}
                        >
                            {tab.isDirty ? (
                                <Circle className="w-2 h-2 fill-current group-hover:hidden" />
                            ) : null}
                            <X className={`w-3.5 h-3.5 ${tab.isDirty ? 'hidden group-hover:block' : ''}`} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
