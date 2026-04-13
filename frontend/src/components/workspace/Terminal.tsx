"use client";

import React, { useEffect, useRef } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

interface WorkspaceTerminalProps {
    workspaceId: number;
    isVisible: boolean;
}

export const WorkspaceTerminal: React.FC<WorkspaceTerminalProps> = ({ workspaceId, isVisible }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const connectingRef = useRef(false);

    useEffect(() => {
        if (!isVisible || !terminalRef.current) return;
        if (connectingRef.current || xtermRef.current) return;

        connectingRef.current = true;
        let cancelled = false;

        const init = async () => {
            const { Terminal } = await import("@xterm/xterm");
            const { FitAddon } = await import("@xterm/addon-fit");
            await import("@xterm/xterm/css/xterm.css");

            if (cancelled || !terminalRef.current) return;

            const term = new Terminal({
                cursorBlink: true,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                fontSize: 14,
                theme: {
                    background: "#0B0F0E",
                    foreground: "#E6F1EC",
                    cursor: "#2EFF7B",
                    cursorAccent: "#0B0F0E",
                    selectionBackground: "#2EFF7B33",
                    black: "#0B0F0E",
                    red: "#FF5555",
                    green: "#2EFF7B",
                    yellow: "#E6CD69",
                    blue: "#69B4E6",
                    magenta: "#7EE5FF",
                    cyan: "#69E6E6",
                    white: "#E6F1EC",
                    brightBlack: "#5A7268",
                    brightRed: "#FF6E67",
                    brightGreen: "#5AF78E",
                    brightYellow: "#F4F99D",
                    brightBlue: "#CAA9FA",
                    brightMagenta: "#A9F0FF",
                    brightCyan: "#9AEDFE",
                    brightWhite: "#FFFFFF",
                },
                scrollback: 5000,
                allowProposedApi: true,
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(terminalRef.current);
            window.setTimeout(() => fitAddon.fit(), 100);

            xtermRef.current = term;
            fitAddonRef.current = fitAddon;

            const token = window.localStorage.getItem("auth_token");
            if (!token) {
                term.writeln("\r\nNot authenticated. Please log in.\r\n");
                return;
            }

            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsHost = process.env.NEXT_PUBLIC_WS_URL || `${wsProtocol}//localhost:8000`;
            const wsUrl = `${wsHost}/api/v1/terminal/${workspaceId}?token=${token}`;
            const ws = new WebSocket(wsUrl);

            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            ws.onopen = () => {
                term.clear();
                term.focus();
            };

            ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    term.write(new Uint8Array(event.data));
                    return;
                }
                term.write(event.data);
            };

            ws.onclose = (event) => {
                if (!cancelled) {
                    term.writeln(`\r\nTerminal disconnected (${event.code})`);
                }
            };

            ws.onerror = () => {
                if (!cancelled) {
                    term.writeln("\r\nWebSocket error");
                }
            };

            term.onData((data: string) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(new TextEncoder().encode(data));
                }
            });
        };

        init();

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
    }, [isVisible, workspaceId]);

    useEffect(() => {
        if (!isVisible || !fitAddonRef.current) return;

        const handleResize = () => {
            try {
                fitAddonRef.current?.fit();
            } catch {
                // Ignore fit errors during resize transitions.
            }
        };

        const timer = window.setTimeout(handleResize, 50);
        window.addEventListener("resize", handleResize);

        let observer: ResizeObserver | null = null;
        if (terminalRef.current) {
            observer = new ResizeObserver(() => handleResize());
            observer.observe(terminalRef.current);
        }

        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("resize", handleResize);
            observer?.disconnect();
        };
    }, [isVisible]);

    return (
        <div
            ref={terminalRef}
            className="h-full w-full"
            style={{
                display: isVisible ? "block" : "none",
                padding: "4px",
                backgroundColor: "#0B0F0E",
            }}
        />
    );
};
