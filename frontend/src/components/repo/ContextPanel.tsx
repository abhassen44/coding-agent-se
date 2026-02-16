'use client';

import React from 'react';

interface ChunkResult {
    id: number;
    file_id: number;
    content: string;
    start_line: number;
    end_line: number;
    file_path?: string;
    file_name?: string;
    relevance_score: number;
}

interface ContextPanelProps {
    chunks: ChunkResult[];
    query?: string;
    isLoading?: boolean;
    onChunkClick?: (chunk: ChunkResult) => void;
}

function RelevanceBar({ score }: { score: number }) {
    const percentage = Math.round(score * 100);
    const getColor = () => {
        if (percentage >= 80) return 'var(--success-color, #22c55e)';
        if (percentage >= 60) return 'var(--warning-color, #f59e0b)';
        return 'var(--text-muted, #6b7280)';
    };

    return (
        <div className="relevance-bar">
            <div
                className="relevance-fill"
                style={{
                    width: `${percentage}%`,
                    background: getColor(),
                }}
            />
            <span className="relevance-label">{percentage}%</span>
            <style jsx>{`
        .relevance-bar {
          position: relative;
          width: 60px;
          height: 6px;
          background: var(--bg-tertiary, #374151);
          border-radius: 3px;
          overflow: hidden;
        }
        .relevance-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }
        .relevance-label {
          position: absolute;
          right: -30px;
          top: -4px;
          font-size: 10px;
          color: var(--text-muted, #6b7280);
        }
      `}</style>
        </div>
    );
}

function ChunkCard({ chunk, onClick }: { chunk: ChunkResult; onClick?: () => void }) {
    const truncatedContent = chunk.content.length > 200
        ? chunk.content.substring(0, 200) + '...'
        : chunk.content;

    return (
        <div className="chunk-card" onClick={onClick}>
            <div className="chunk-header">
                <span className="chunk-file" title={chunk.file_path}>
                    {chunk.file_name || 'Unknown file'}
                </span>
                <RelevanceBar score={chunk.relevance_score} />
            </div>
            <div className="chunk-lines">
                Lines {chunk.start_line} - {chunk.end_line}
            </div>
            <pre className="chunk-content">
                <code>{truncatedContent}</code>
            </pre>
            <style jsx>{`
        .chunk-card {
          background: var(--bg-secondary, #1f2937);
          border: 1px solid var(--border-color, #374151);
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .chunk-card:hover {
          border-color: var(--primary-color, #6366f1);
          transform: translateY(-1px);
        }
        .chunk-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .chunk-file {
          font-weight: 600;
          color: var(--primary-color, #6366f1);
          font-size: 13px;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chunk-lines {
          font-size: 11px;
          color: var(--text-muted, #6b7280);
          margin-bottom: 8px;
        }
        .chunk-content {
          margin: 0;
          padding: 8px;
          background: var(--bg-code, #0d1117);
          border-radius: 4px;
          font-size: 11px;
          color: var(--text-secondary, #9ca3af);
          max-height: 100px;
          overflow: hidden;
          font-family: 'Fira Code', 'JetBrains Mono', monospace;
        }
      `}</style>
        </div>
    );
}

export default function ContextPanel({
    chunks,
    query,
    isLoading = false,
    onChunkClick,
}: ContextPanelProps) {
    return (
        <div className="context-panel">
            <div className="context-header">
                <span className="context-title">🔍 Related Code</span>
                {chunks.length > 0 && (
                    <span className="context-count">{chunks.length} results</span>
                )}
            </div>

            {query && (
                <div className="context-query">
                    Query: <span className="query-text">{query}</span>
                </div>
            )}

            <div className="context-content">
                {isLoading ? (
                    <div className="context-loading">
                        <div className="loading-spinner" />
                        <span>Searching...</span>
                    </div>
                ) : chunks.length > 0 ? (
                    <div className="chunks-list">
                        {chunks.map((chunk) => (
                            <ChunkCard
                                key={chunk.id}
                                chunk={chunk}
                                onClick={() => onChunkClick?.(chunk)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="context-empty">
                        <span className="empty-icon">📭</span>
                        <span className="empty-text">
                            {query
                                ? 'No matching code found'
                                : 'Enter a query to find related code'}
                        </span>
                    </div>
                )}
            </div>

            <style jsx>{`
        .context-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary, #1a1a2e);
          border-left: 1px solid var(--border-color, #2d2d44);
        }
        
        .context-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color, #2d2d44);
        }
        
        .context-title {
          font-weight: 600;
          color: var(--text-primary, #fff);
          font-size: 14px;
        }
        
        .context-count {
          font-size: 12px;
          color: var(--text-muted, #6b7280);
          background: var(--bg-tertiary, #374151);
          padding: 2px 8px;
          border-radius: 10px;
        }
        
        .context-query {
          padding: 8px 16px;
          background: var(--bg-tertiary, #111827);
          font-size: 12px;
          color: var(--text-muted, #6b7280);
        }
        
        .query-text {
          color: var(--text-primary, #fff);
          font-style: italic;
        }
        
        .context-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }
        
        .chunks-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .context-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 12px;
          color: var(--text-muted, #6b7280);
        }
        
        .loading-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid var(--border-color, #374151);
          border-top-color: var(--primary-color, #6366f1);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .context-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 8px;
          color: var(--text-muted, #6b7280);
          text-align: center;
        }
        
        .empty-icon {
          font-size: 32px;
        }
        
        .empty-text {
          font-size: 13px;
        }
      `}</style>
        </div>
    );
}

export type { ChunkResult, ContextPanelProps };
