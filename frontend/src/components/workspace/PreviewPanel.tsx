'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, RefreshCcw, ExternalLink, Globe, Loader2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface PreviewPanelProps {
    workspaceId: number;
    isVisible: boolean;
}

const PRESETS = [
    { label: 'npm run dev', command: 'npm run dev', port: 3000 },
    { label: 'npm start', command: 'npm start', port: 3000 },
    { label: 'python serving', command: 'python -m http.server 8080', port: 8080 },
    { label: 'uvicorn', command: 'uvicorn main:app --reload --host 0.0.0.0 --port 8000', port: 8000 },
];

export function PreviewPanel({ workspaceId, isVisible }: PreviewPanelProps) {
    const [status, setStatus] = useState<'stopped' | 'starting' | 'running' | 'error'>('stopped');
    const [command, setCommand] = useState(PRESETS[0].command);
    const [port, setPort] = useState<number>(PRESETS[0].port);
    const [hostPort, setHostPort] = useState<number | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [iframeKey, setIframeKey] = useState(0); // Used to force refresh iframe
    const [authToken, setAuthToken] = useState<string | null>(null);

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch auth token once to pass to iframe
    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        setAuthToken(token);
    }, []);

    // Initial status check
    useEffect(() => {
        if (!isVisible) return;
        checkStatus();
        return stopPolling;
    }, [isVisible, workspaceId]);

    const checkStatus = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/preview/${workspaceId}/status`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.running && data.reachable) {
                    setStatus('running');
                    setHostPort(data.host_port);
                    setCommand(data.command || command);
                    setPort(data.app_port || port);
                    stopPolling();
                } else if (data.running && !data.reachable) {
                    setStatus('starting');
                    startPolling();
                } else {
                    setStatus('stopped');
                    setHostPort(null);
                    stopPolling();
                }
                
                if (data.error) {
                     setErrorMsg(data.error);
                     setStatus('error');
                     stopPolling();
                }
            } else {
                 const err = await res.json();
                 if(res.status === 400 && err.detail?.includes("not running")){
                     setStatus("error");
                     setErrorMsg("Workspace container is not running");
                     stopPolling();
                 }
            }
        } catch (error) {
            console.error('Failed to check preview status', error);
        }
    };

    const startPolling = () => {
        if (pollIntervalRef.current) return;
        pollIntervalRef.current = setInterval(checkStatus, 3000);
    };

    const stopPolling = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    };

    const handleStart = async () => {
        setStatus('starting');
        setErrorMsg(null);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/preview/${workspaceId}/start`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ command, port: Number(port) })
            });

            if (res.ok) {
                const data = await res.json();
                if(data.reachable){
                    setStatus('running');
                    setHostPort(data.host_port);
                } else {
                    // Start polling until reachable
                    startPolling();
                }
            } else {
                const errData = await res.json();
                setStatus('error');
                setErrorMsg(errData.detail || 'Failed to start preview');
            }
        } catch (error: any) {
            setStatus('error');
            setErrorMsg(error.message || 'Network error');
        }
    };

    const handleStop = async () => {
        setStatus('stopped');
        setHostPort(null);
        stopPolling();
        
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/preview/${workspaceId}/stop`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
        } catch (error) {
            console.error('Failed to stop preview', error);
        }
    };

    const handleRefresh = () => {
        setIframeKey(prev => prev + 1);
    };

    const handleOpenExternal = () => {
        if (hostPort) {
            window.open(`http://localhost:${hostPort}`, '_blank');
        }
    };

    if (!isVisible) return null;

    const iframeUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/preview/${workspaceId}/proxy/?token=${authToken || ''}`;

    return (
        <div className="flex flex-col h-full bg-[#0B0F0E]">
            {/* Top Bar Setup */}
            <div className="flex-none bg-[#111917] border-b border-[#1F2D28] p-3">
                <div className="flex flex-col gap-3">
                    
                    {/* Header line with status */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-[#2EFF7B]" />
                            <span className="text-sm font-semibold text-[#8FAEA2] uppercase tracking-wider">Live Preview</span>
                        </div>
                        
                        {/* Status Badge */}
                        <div className="flex items-center text-xs">
                            {status === 'running' && (
                                <span className="flex items-center gap-1.5 px-2 py-1 bg-[#2EFF7B]/10 text-[#2EFF7B] border border-[#2EFF7B]/20 rounded-lg">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#2EFF7B]"></span>
                                    Running on :{hostPort}
                                </span>
                            )}
                            {status === 'starting' && (
                                <span className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-lg">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Starting...
                                </span>
                            )}
                            {status === 'stopped' && (
                                <span className="flex items-center gap-1.5 px-2 py-1 bg-[#1A2420] text-[#5A7268] border border-[#1F2D28] rounded-lg">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#5A7268]"></span>
                                    Stopped
                                </span>
                            )}
                            {status === 'error' && (
                                <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg max-w-[200px] truncate" title={errorMsg || ''}>
                                    <AlertCircle className="w-3 h-3" />
                                    {errorMsg || 'Error'}
                                </span>
                            )}
                        </div>
                    </div>
                    
                    {/* Controls Row */}
                    <div className="flex items-center gap-2">
                         <input 
                            type="text" 
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            disabled={status === 'running' || status === 'starting'}
                            placeholder="npm run dev"
                            className="flex-1 min-w-0 bg-[#0B0F0E] border border-[#1F2D28] rounded-lg px-3 py-1.5 text-sm text-[#E6F1EC] placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none disabled:opacity-50"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-[#5A7268]">Port:</span>
                            <input 
                                type="number" 
                                value={port}
                                onChange={(e) => setPort(Number(e.target.value))}
                                disabled={status === 'running' || status === 'starting'}
                                className="w-16 bg-[#0B0F0E] border border-[#1F2D28] rounded-lg px-2 py-1.5 text-sm text-[#E6F1EC] focus:border-[#2EFF7B] focus:outline-none disabled:opacity-50 text-center"
                            />
                        </div>
                        
                        {(status === 'stopped' || status === 'error') ? (
                             <button 
                                onClick={handleStart}
                                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#2EFF7B] text-[#0B0F0E] rounded-lg text-sm font-medium hover:bg-[#1ED760] transition-colors shrink-0"
                            >
                                <Play className="w-4 h-4 fill-current" /> Start
                            </button>
                        ) : (
                             <button 
                                onClick={handleStop}
                                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1A2420] text-red-400 border border-[#1F2D28] rounded-lg text-sm font-medium hover:bg-red-500/10 hover:border-red-500/30 transition-colors shrink-0"
                            >
                                <Square className="w-4 h-4 fill-current" /> Stop
                            </button>
                        )}
                    </div>
                    
                    {/* Presets Row */}
                    {(status === 'stopped' || status === 'error') && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-[#5A7268] mr-1">Presets:</span>
                            {PRESETS.map((preset) => (
                                <button
                                    key={preset.label}
                                    onClick={() => { setCommand(preset.command); setPort(preset.port); }}
                                    className="px-2 py-1 bg-[#1A2420] border border-[#1F2D28] rounded-md text-[10px] text-[#8FAEA2] hover:text-[#2EFF7B] hover:border-[#2EFF7B]/30 transition-colors"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Browser Header (Toolbar) */}
            {status === 'running' && (
                <div className="flex-none h-9 bg-[#1A2420] border-b border-[#1F2D28] flex items-center px-3 justify-between">
                    <div className="flex gap-1.5">
                       <span className="w-2.5 h-2.5 rounded-full bg-red-400/80"></span>
                       <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/80"></span>
                       <span className="w-2.5 h-2.5 rounded-full bg-green-400/80"></span>
                    </div>
                    <div className="flex-1 mx-4 flex items-center justify-center">
                        <div className="px-4 py-1 bg-[#0B0F0E] rounded border border-[#1F2D28] text-[11px] text-[#8FAEA2] font-mono w-full max-w-sm text-center truncate shadow-inner">
                            http://localhost:{hostPort}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleRefresh}
                            className="p-1 text-[#8FAEA2] hover:text-[#2EFF7B] transition-colors"
                            title="Reload Preview"
                        >
                            <RefreshCcw className="w-3.5 h-3.5" />
                        </button>
                        <button 
                             onClick={handleOpenExternal}
                             className="p-1 text-[#8FAEA2] hover:text-[#2EFF7B] transition-colors"
                             title="Open in New Tab"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Iframe Container */}
            <div className="flex-1 min-h-0 relative bg-white">
                {status === 'running' ? (
                     <iframe 
                        key={iframeKey}
                        src={iframeUrl}
                        className="w-full h-full border-none"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        title="Live Preview"
                     />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0F0E] text-[#5A7268]">
                        <Globe className="w-12 h-12 mb-4 opacity-50" />
                        <h3 className="text-lg font-medium text-[#E6F1EC] mb-2">Live Preview</h3>
                        <p className="text-sm text-center max-w-sm px-4">
                            Start a development server to preview your application here. 
                            The preview will proxy requests directly to your workspace container.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
