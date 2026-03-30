'use client';

import React, { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';

// Import common language syntax highlighting
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-css';

interface CodeViewerProps {
    code: string;
    language?: string;
    fileName?: string;
    filePath?: string;
    highlightLines?: number[];
    onLineClick?: (lineNumber: number) => void;
}

const LANGUAGE_MAP: Record<string, string> = {
    python: 'python',
    javascript: 'javascript',
    typescript: 'typescript',
    jsx: 'jsx',
    tsx: 'tsx',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    go: 'go',
    rust: 'rust',
    ruby: 'ruby',
    bash: 'bash',
    json: 'json',
    yaml: 'yaml',
    markdown: 'markdown',
    sql: 'sql',
    css: 'css',
    html: 'markup',
};

export default function CodeViewer({
    code,
    language = 'text',
    fileName,
    filePath,
    highlightLines = [],
    onLineClick,
}: CodeViewerProps) {
    const codeRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (codeRef.current) {
            Prism.highlightElement(codeRef.current);
        }
    }, [code, language]);

    const lines = code.split('\n');
    const prismLanguage = LANGUAGE_MAP[language] || 'text';

    return (
        <div className="code-viewer">
            {(fileName || filePath) && (
                <div className="code-viewer-header">
                    <span className="file-name">{fileName || filePath}</span>
                    <span className="line-count">{lines.length} lines</span>
                </div>
            )}
            <div className="code-viewer-content">
                <div className="line-numbers">
                    {lines.map((_, index) => (
                        <div
                            key={index}
                            className={`line-number ${highlightLines.includes(index + 1) ? 'highlighted' : ''}`}
                            onClick={() => onLineClick?.(index + 1)}
                        >
                            {index + 1}
                        </div>
                    ))}
                </div>
                <pre className="code-pre">
                    <code
                        ref={codeRef}
                        className={`language-${prismLanguage}`}
                    >
                        {code}
                    </code>
                </pre>
            </div>
            <style>{`
        .code-viewer {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-code, #0d1117);
          border-radius: 8px;
          overflow: hidden;
        }
        
        .code-viewer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 16px;
          background: var(--bg-secondary, #161b22);
          border-bottom: 1px solid var(--border-color, #30363d);
        }
        
        .file-name {
          font-weight: 600;
          color: var(--text-primary, #c9d1d9);
          font-size: 13px;
        }
        
        .line-count {
          font-size: 12px;
          color: var(--text-muted, #8b949e);
        }
        
        .code-viewer-content {
          display: flex;
          flex: 1;
          overflow: auto;
        }
        
        .line-numbers {
          flex-shrink: 0;
          padding: 12px 0;
          background: var(--bg-code, #0d1117);
          border-right: 1px solid var(--border-color, #30363d);
          user-select: none;
        }
        
        .line-number {
          padding: 0 12px;
          text-align: right;
          color: var(--text-muted, #6e7681);
          font-size: 12px;
          font-family: 'Fira Code', 'JetBrains Mono', monospace;
          line-height: 1.6;
          min-width: 40px;
          cursor: pointer;
        }
        
        .line-number:hover {
          color: var(--text-primary, #c9d1d9);
        }
        
        .line-number.highlighted {
          background: rgba(255, 200, 0, 0.1);
          color: var(--warning-color, #d29922);
        }
        
        .code-pre {
          flex: 1;
          margin: 0;
          padding: 12px 16px;
          overflow: auto;
          font-size: 13px;
          line-height: 1.6;
          font-family: 'Fira Code', 'JetBrains Mono', monospace;
        }
        
        .code-pre code {
          background: transparent !important;
        }
      `}</style>
        </div>
    );
}

export type { CodeViewerProps };
