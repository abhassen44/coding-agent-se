'use client';

import React, { useEffect, useRef } from 'react';

interface WorkspaceTerminalProps {
    workspaceId: number;
    isVisible: boolean;
}

export const WorkspaceTerminal: React.FC<WorkspaceTerminalProps> = ({ workspaceId, isVisible }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<any>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitAddonRef = useRef<any>(null);
    const connectingRef = useRef(false); // guard against double-connect

    useEffect(() => {
        if (!isVisible || !terminalRef.current) return;

        // Prevent duplicate connections (React strict mode, re-renders, etc.)
        if (connectingRef.current || xtermRef.current) return;
        connectingRef.current = true;

        let cancelled = false;

        const init = async () => {
            const { Terminal } = await import('@xterm/xterm');
            const { FitAddon } = await import('@xterm/addon-fit');
            // @ts-ignore - CSS module import
            await import('@xterm/xterm/css/xterm.css');

            if (cancelled || !terminalRef.current) return;

            const term = new Terminal({
                cursorBlink: true,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: 14,
                theme: {
                    background: '#0B0F0E',
                    foreground: '#E6F1EC',
                    cursor: '#2EFF7B',
                    cursorAccent: '#0B0F0E',
                    selectionBackground: '#2EFF7B33',
                    black: '#0B0F0E',
                    red: '#FF5555',
                    green: '#2EFF7B',
                    yellow: '#E6CD69',
                    blue: '#69B4E6',
                    magenta: '#BD93F9',
                    cyan: '#69E6E6',
                    white: '#E6F1EC',
                    brightBlack: '#5A7268',
                    brightRed: '#FF6E67',
                    brightGreen: '#5AF78E',
                    brightYellow: '#F4F99D',
                    brightBlue: '#CAA9FA',
                    brightMagenta: '#FF92D0',
                    brightCyan: '#9AEDFE',
                    brightWhite: '#FFFFFF',
                },
                scrollback: 5000,
                allowProposedApi: true,
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(terminalRef.current);
            setTimeout(() => fitAddon.fit(), 100);

            xtermRef.current = term;
            fitAddonRef.current = fitAddon;

            // Connect WebSocket
            const token = localStorage.getItem('auth_token');
            if (!token) {
                term.writeln('\r\n\x1b[31m❌ Not authenticated. Please log in.\x1b[0m\r\n');
                return;
            }

            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsHost = process.env.NEXT_PUBLIC_WS_URL || `${wsProtocol}//localhost:8000`;
            const wsUrl = `${wsHost}/api/v1/terminal/${workspaceId}?token=${token}`;

            const ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;

            ws.onopen = () => {
                term.clear();
                term.focus();
            };

            ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    term.write(new Uint8Array(event.data));
                } else {
                    term.write(event.data);
                }
            };

            ws.onclose = (event) => {
                if (!cancelled) {
                    term.writeln(`\r\n\x1b[2m🔌 Terminal disconnected (${event.code})\x1b[0m`);
                }
            };

            ws.onerror = () => {
                if (!cancelled) {
                    term.writeln('\r\n\x1b[31m❌ WebSocket error\x1b[0m');
                }
            };

            // Send keystrokes to container
            term.onData((data: string) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(new TextEncoder().encode(data));
                }
            });
        };

        init();

        // Cleanup on unmount or when deps change
        return () => {
            cancelled = true;
            connectingRef.current = false;

            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (xtermRef.current) {
                xtermRef.current.dispose();
                xtermRef.current = null;
            }
        };
    }, [workspaceId, isVisible]);

    // Resize on visibility change / window resize / container resize
    useEffect(() => {
        if (!isVisible || !fitAddonRef.current) return;

        const handleResize = () => {
            try {
                fitAddonRef.current?.fit();
            } catch {
                // Ignore fit errors during transitions
            }
        };

        // Fit when becoming visible or container resizes
        const timer = setTimeout(handleResize, 50);
        window.addEventListener('resize', handleResize);

        // Use ResizeObserver to re-fit when the terminal container is resized (drag handle)
        let observer: ResizeObserver | null = null;
        if (terminalRef.current) {
            observer = new ResizeObserver(() => {
                handleResize();
            });
            observer.observe(terminalRef.current);
        }

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', handleResize);
            observer?.disconnect();
        };
    }, [isVisible]);

    return (
        <div
            ref={terminalRef}
            className="w-full h-full"
            style={{
                display: isVisible ? 'block' : 'none',
                padding: '4px',
                backgroundColor: '#0B0F0E',
            }}
        />
    );
};
