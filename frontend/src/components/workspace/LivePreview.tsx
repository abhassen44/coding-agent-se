import React, { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { WorkspaceResponse, apiClient, getErrorMessage } from '@/lib/api';
import {
    RefreshCw,
    ExternalLink,
    Globe,
    Lock,
    Server,
    ChevronDown,
    Info,
    AlertCircle
} from 'lucide-react';

interface LivePreviewProps {
    workspace: WorkspaceResponse | null;
    isVisible: boolean;
    allowDirect?: boolean;
}

interface PreviewSession {
    token: string;
    expiresAt: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const subscribeLocalhost = () => () => undefined;
const getLocalhostSnapshot = () =>
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);
const getLocalhostServerSnapshot = () => false;

export function LivePreview({ workspace, isVisible, allowDirect }: LivePreviewProps) {
    const [selectedPort, setSelectedPort] = useState<string>('');
    const [pathInput, setPathInput] = useState<string>('/');
    const [directPath, setDirectPath] = useState<string>('/');
    const [directRefreshKey, setDirectRefreshKey] = useState<number>(0);
    const [mode, setMode] = useState<'proxy' | 'direct'>('proxy');
    const [iframeUrl, setIframeUrl] = useState<string>('');
    const [previewSession, setPreviewSession] = useState<PreviewSession | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const pathRef = useRef(pathInput);
    pathRef.current = pathInput;
    const localhost = useSyncExternalStore(
        subscribeLocalhost,
        getLocalhostSnapshot,
        getLocalhostServerSnapshot
    );
    const isDirectAvailable = allowDirect === undefined ? localhost : allowDirect;

    const ports = useMemo(() => workspace?.ports || {}, [workspace?.ports]);
    const availablePorts = useMemo(() => Object.keys(ports).sort(), [ports]);
    const preferredPort = useMemo(() => {
        return ['3000', '5173', '8000', '8080', '5000'].find((p) => availablePorts.includes(p))
            || availablePorts[0]
            || '';
    }, [availablePorts]);

    const effectivePort = selectedPort && availablePorts.includes(selectedPort)
        ? selectedPort
        : preferredPort;

    const mappedPort = effectivePort ? workspace?.ports?.[effectivePort] : undefined;
    const normalizedDirectPath = directPath.startsWith('/') ? directPath : `/${directPath}`;
    const directRefresh = directRefreshKey
        ? `${normalizedDirectPath.includes('?') ? '&' : '?'}__preview_refresh=${directRefreshKey}`
        : '';
    const directUrl = mode === 'direct' && mappedPort
        ? `http://127.0.0.1:${mappedPort}${normalizedDirectPath}${directRefresh}`
        : '';
    const displayUrl = mode === 'direct' ? directUrl : iframeUrl;

    const getProxyUrl = useCallback((port: string, path: string, token: string) => {
        if (!workspace?.id || !port || !token) return '';
        const cleanPath = path.replace(/^\/+/, '');
        return `${API_BASE_URL}/workspace/${workspace.id}/proxy/${token}/${port}/${cleanPath}`;
    }, [workspace?.id]);

    const loadPreview = useCallback(async (targetPath?: string, cacheBust = false) => {
        const path = targetPath ?? pathRef.current;
        if (!workspace?.id || !effectivePort) {
            setIframeUrl('');
            setPreviewSession(null);
            return;
        }

        setIsLoading(true);
        setLoadError(null);
        try {
            const data = await apiClient.getWorkspacePreviewToken(workspace.id, Number(effectivePort));
            let url = getProxyUrl(effectivePort, path, data.token);
            if (cacheBust) {
                url += `${url.includes('?') ? '&' : '?'}__preview_refresh=${Date.now()}`;
            }
            setPreviewSession({
                token: data.token,
                expiresAt: Date.now() + data.expires_in * 1000,
            });
            setIframeUrl(url);
        } catch (error) {
            setPreviewSession(null);
            setIframeUrl('');
            setLoadError(getErrorMessage(error, 'Could not start the preview session.'));
        } finally {
            setIsLoading(false);
        }
    }, [workspace?.id, effectivePort, getProxyUrl]);

    // Load (or reload) when the pane opens, the workspace changes, or the port changes.
    useEffect(() => {
        if (!isVisible || mode === 'direct') return;
        void loadPreview();
    }, [isVisible, loadPreview, mode]);

    // Refresh the short-lived token before it expires.
    useEffect(() => {
        if (!isVisible || mode === 'direct' || !previewSession) return;
        const refreshIn = Math.max(5_000, previewSession.expiresAt - Date.now() - 60_000);
        const timer = window.setTimeout(() => void loadPreview(), refreshIn);
        return () => window.clearTimeout(timer);
    }, [isVisible, mode, previewSession, loadPreview]);

    const handleRefresh = () => {
        if (mode === 'direct') {
            setDirectRefreshKey((value) => value + 1);
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        void loadPreview(undefined, true);
    };

    const handleOpenExternal = () => {
        if (displayUrl) window.open(displayUrl, '_blank', 'noopener,noreferrer');
    };

    const handlePortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedPort(event.target.value);
        setLoadError(null);
    };

    const handlePathKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            setLoadError(null);
            if (mode === 'direct') {
                setDirectPath(pathInput);
                setDirectRefreshKey((value) => value + 1);
            } else {
                void loadPreview(pathInput);
            }
        }
    };

    if (!isVisible) return null;

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#0B0F0E] text-[#E6F1EC] h-full border-l border-[#1F2D28]">
            {/* Toolbar */}
            <div className="h-11 flex items-center justify-between px-3 bg-[#111917] border-b border-[#1F2D28] shrink-0 gap-2">
                {/* Port Selector */}
                <div className="flex items-center gap-1.5 shrink-0 bg-[#1A2420] border border-[#1F2D28] rounded-lg px-2.5 py-1">
                    <Server className="w-3.5 h-3.5 text-[#2EFF7B]" />
                    {availablePorts.length > 0 ? (
                        <div className="relative flex items-center">
                            <select
                                value={effectivePort}
                                onChange={handlePortChange}
                                className="bg-transparent text-xs font-semibold text-[#E6F1EC] outline-none pr-4 appearance-none cursor-pointer"
                            >
                                {availablePorts.map((port) => (
                                    <option key={port} value={port} className="bg-[#111917] text-[#E6F1EC]">
                                        Port {port}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="w-3 h-3 text-[#5A7268] absolute right-0 pointer-events-none" />
                        </div>
                    ) : (
                        <span className="text-xs font-semibold text-[#5A7268]">No ports</span>
                    )}
                </div>

                {/* Address Bar */}
                <div className="flex-1 flex items-center gap-2 bg-[#0B0F0E] border border-[#1F2D28] hover:border-[#1F2D28]/80 rounded-lg px-2.5 py-1 text-xs text-[#5A7268]">
                    <Lock className="w-3.5 h-3.5 text-[#2EFF7B]" />
                    <span className="shrink-0 select-none text-[#3A4F46] font-mono">sandbox:</span>
                    <input
                        type="text"
                        value={pathInput}
                        onChange={(event) => setPathInput(event.target.value)}
                        onKeyDown={handlePathKeyDown}
                        disabled={availablePorts.length === 0}
                        className="flex-1 bg-transparent text-[#E6F1EC] outline-none font-mono"
                        placeholder="/"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {isDirectAvailable && (
                        <button
                            type="button"
                            aria-label={mode === 'direct' ? 'Use proxy mode' : 'Use direct mode'}
                            onClick={() => setMode((value) => (value === 'direct' ? 'proxy' : 'direct'))}
                            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                                mode === 'direct'
                                    ? 'bg-[#2EFF7B]/15 text-[#2EFF7B]'
                                    : 'text-[#8FAEA2] hover:bg-[#1A2420] hover:text-[#2EFF7B]'
                            }`}
                            title={mode === 'direct' ? 'Switch to proxy mode' : 'Switch to direct mode (local HMR)'}
                        >
                            {mode === 'direct' ? 'Proxy' : 'Direct'}
                        </button>
                    )}
                    <button
                        onClick={handleRefresh}
                        disabled={availablePorts.length === 0}
                        className="p-1.5 hover:bg-[#1A2420] text-[#8FAEA2] hover:text-[#2EFF7B] disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#2EFF7B]' : ''}`} />
                    </button>
                    <button
                        onClick={handleOpenExternal}
                        disabled={!displayUrl}
                        className="p-1.5 hover:bg-[#1A2420] text-[#8FAEA2] hover:text-[#2EFF7B] disabled:opacity-30 disabled:pointer-events-none rounded-lg transition-colors"
                        title="Open in new window"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Iframe Viewport */}
            <div className="flex-1 min-h-0 relative bg-white">
                {availablePorts.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0F0E] text-[#5A7268] p-6 text-center select-none">
                        <div className="w-12 h-12 rounded-2xl bg-[#1A2420] border border-[#1F2D28] flex items-center justify-center mb-4">
                            <Globe className="w-6 h-6 text-[#5A7268]" />
                        </div>
                        <h3 className="text-sm font-semibold text-[#E6F1EC] mb-1">Live Preview Idle</h3>
                        <p className="text-xs max-w-xs leading-relaxed">
                            No web servers detected. Run your app inside the sandbox terminal:
                        </p>
                        <div className="mt-3 px-3 py-1.5 bg-[#111917] border border-[#1F2D28] rounded-lg font-mono text-[10px] text-[#2EFF7B] text-left">
                            npm run dev<br />
                            # or python -m http.server 8000
                        </div>
                        <div className="mt-6 flex items-center gap-1.5 text-[10px] text-[#3A4F46]">
                            <Info className="w-3 h-3" />
                            <span>Preview supports ports 3000, 5000, 5173, 8000, 8080</span>
                        </div>
                    </div>
                ) : displayUrl || loadError ? (
                    <>
                        {displayUrl && (
                            <iframe
                                ref={iframeRef}
                                src={displayUrl}
                                className="w-full h-full border-none"
                                onLoad={() => setIsLoading(false)}
                                onError={() => {
                                    setIsLoading(false);
                                    setLoadError('The preview could not be loaded.');
                                }}
                            />
                        )}
                        {isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-[#0B0F0E]/50">
                                <RefreshCw className="w-8 h-8 animate-spin text-[#2EFF7B]" />
                            </div>
                        )}
                        {loadError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0F0E] text-center p-6">
                                <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
                                <h3 className="text-sm font-semibold text-[#E6F1EC] mb-1">Failed to Connect</h3>
                                <p className="text-xs text-[#5A7268] max-w-xs leading-relaxed">
                                    {loadError}
                                </p>
                                <p className="text-xs text-[#5A7268] max-w-xs leading-relaxed mt-2">
                                    Make sure your dev server is running on port{' '}
                                    <span className="font-semibold text-[#E6F1EC]">{effectivePort}</span> inside the terminal.
                                </p>
                                <button
                                    onClick={handleRefresh}
                                    className="mt-4 px-3 py-1.5 bg-[#1A2420] hover:bg-[#253530] border border-[#1F2D28] text-xs font-semibold rounded-lg text-[#2EFF7B]"
                                >
                                    Retry Connection
                                </button>
                            </div>
                        )}
                    </>
                ) : null}
            </div>
        </div>
    );
}
