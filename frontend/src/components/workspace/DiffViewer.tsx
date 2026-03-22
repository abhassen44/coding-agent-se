'use client';

import React from 'react';

interface DiffViewerProps {
    content: string;
    path: string;
}

/**
 * Simple code preview for proposed file changes.
 * Shows the new file content with syntax-highlighted preview.
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({ content, path }) => {
    const ext = path.split('.').pop() || '';
    const langMap: Record<string, string> = {
        py: 'Python', js: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
        jsx: 'JavaScript', html: 'HTML', css: 'CSS', json: 'JSON',
        md: 'Markdown', sh: 'Shell', yaml: 'YAML', yml: 'YAML',
        go: 'Go', rs: 'Rust', java: 'Java', rb: 'Ruby',
    };

    const language = langMap[ext] || ext.toUpperCase();
    const lines = content.split('\n');
    const displayLines = lines.slice(0, 50); // Show first 50 lines
    const truncated = lines.length > 50;

    return (
        <div className="rounded-lg border border-[#1F2D28] overflow-hidden bg-[#0B0F0E]">
            {/* File header */}
            <div className="flex items-center justify-between px-2 py-1 bg-[#111917] border-b border-[#1F2D28]">
                <span className="text-[10px] text-[#8FAEA2] font-mono">{path}</span>
                <span className="text-[9px] text-[#5A7268]">{language} • {lines.length} lines</span>
            </div>

            {/* Code content */}
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-[11px] font-mono leading-4">
                    <tbody>
                        {displayLines.map((line, i) => (
                            <tr key={i} className="hover:bg-[#1A2420]/50">
                                <td className="select-none text-right pr-2 pl-2 text-[#5A7268] w-8 align-top">
                                    {i + 1}
                                </td>
                                <td className="pr-3 text-[#2EFF7B]/80 whitespace-pre">
                                    <span className="text-[#2EFF7B]/30 mr-1">+</span>
                                    {line}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {truncated && (
                    <div className="px-3 py-1 text-[10px] text-[#5A7268] border-t border-[#1F2D28]">
                        ... and {lines.length - 50} more lines
                    </div>
                )}
            </div>
        </div>
    );
};
