"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { apiClient, ConversationListItem } from "@/lib/api";

const navItems = [
    { icon: "💬", label: "Chat", href: "/chat" },
    { icon: "▶️", label: "Execution", href: "/execute" },
    { icon: "📁", label: "Repository", href: "/repository" },
    { icon: "🖥️", label: "Workspace", href: "/workspace" },
    { icon: "📤", label: "Upload", href: "/upload" },
];

export interface RecentChat {
    id: string;
    title: string;
    timestamp: number;
}

/** Reads recent chats from localStorage as fallback. */
function loadRecentChatsLocal(): RecentChat[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem("recent_chats");
        if (!raw) return [];
        return JSON.parse(raw) as RecentChat[];
    } catch {
        return [];
    }
}

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    // Phase 6: Load recent chats from API, fallback to localStorage
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await apiClient.listConversations();
                if (cancelled) return;
                const apiChats: RecentChat[] = res.conversations.slice(0, 5).map((c: ConversationListItem) => ({
                    id: String(c.id),
                    title: c.title || "Untitled",
                    timestamp: new Date(c.updated_at).getTime(),
                }));
                setRecentChats(apiChats);
            } catch {
                // Fallback to localStorage (user might not be logged in)
                if (!cancelled) {
                    setRecentChats(loadRecentChatsLocal().slice(0, 5));
                }
            }
        })();
        return () => { cancelled = true; };
    }, [pathname, refreshKey]);

    // Listen for conversation-updated events from ChatInterface
    useEffect(() => {
        const handler = () => setRefreshKey(k => k + 1);
        window.addEventListener("conversation-updated", handler);
        return () => window.removeEventListener("conversation-updated", handler);
    }, []);

    // Close kebab menu on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Auto-focus rename input
    useEffect(() => {
        if (renamingId && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renamingId]);

    const handleNewChat = () => {
        setIsMobileOpen(false);
        // Always navigate to a fresh chat
        router.push("/chat?new=" + Date.now());
    };

    const handleDelete = async (chatId: string) => {
        setMenuOpenId(null);
        try {
            await apiClient.deleteConversation(parseInt(chatId, 10));
            setRecentChats((prev) => prev.filter((c) => c.id !== chatId));
            window.dispatchEvent(new CustomEvent("conversation-updated"));
        } catch (err) {
            console.error("Failed to delete conversation:", err);
        }
    };

    const handleRenameStart = (chat: RecentChat) => {
        setMenuOpenId(null);
        setRenamingId(chat.id);
        setRenameValue(chat.title);
    };

    const handleRenameSubmit = async (chatId: string) => {
        const trimmed = renameValue.trim();
        if (!trimmed) {
            setRenamingId(null);
            return;
        }
        try {
            await apiClient.renameConversation(parseInt(chatId, 10), trimmed);
            setRecentChats((prev) =>
                prev.map((c) => (c.id === chatId ? { ...c, title: trimmed } : c))
            );
            window.dispatchEvent(new CustomEvent("conversation-updated"));
        } catch (err) {
            console.error("Failed to rename conversation:", err);
        }
        setRenamingId(null);
    };

    return (
        <>
            {/* Mobile Toggle Button */}
            <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className="fixed top-4 left-4 z-50 md:hidden w-10 h-10 bg-[#111917] border border-[#1F2D28] rounded-xl flex items-center justify-center"
            >
                <svg className="w-5 h-5 text-[#2EFF7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isMobileOpen ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                </svg>
            </button>

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-30 md:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-56 bg-[#111917] border-r border-[#1F2D28] flex flex-col z-40 transition-transform duration-300 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                {/* New Chat */}
                <div className="p-4">
                    <button
                        onClick={handleNewChat}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-[#2EFF7B] hover:bg-[#1ED760] text-[#0B0F0E] font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New Chat
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 overflow-y-auto">
                    <div className="text-xs font-medium text-[#5A7268] uppercase tracking-wider px-3 mb-2">Navigation</div>
                    <ul className="space-y-1">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        onClick={() => setIsMobileOpen(false)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${isActive
                                                ? "bg-[#2EFF7B]/10 text-[#2EFF7B] border border-[#2EFF7B]/30"
                                                : "text-[#8FAEA2] hover:text-[#E6F1EC] hover:bg-[#1A2420]"
                                            }`}
                                    >
                                        <span className="text-base">{item.icon}</span>
                                        <span>{item.label}</span>
                                        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#2EFF7B]" />}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>

                    {/* Recent Chats with kebab menu */}
                    <div className="mt-6">
                        <div className="text-xs font-medium text-[#5A7268] uppercase tracking-wider px-3 mb-2">Recent</div>
                        {recentChats.length === 0 ? (
                            <p className="px-3 text-xs text-[#3D5249] italic">No recent chats</p>
                        ) : (
                            <ul className="space-y-1">
                                {recentChats.map((chat) => (
                                    <li key={chat.id} className="relative group">
                                        {renamingId === chat.id ? (
                                            /* ── Inline rename input ── */
                                            <div className="px-2 py-1">
                                                <input
                                                    ref={renameInputRef}
                                                    value={renameValue}
                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleRenameSubmit(chat.id);
                                                        if (e.key === "Escape") setRenamingId(null);
                                                    }}
                                                    onBlur={() => handleRenameSubmit(chat.id)}
                                                    className="w-full bg-[#1A2420] text-[#E6F1EC] text-sm px-2 py-1.5 rounded-lg border border-[#2EFF7B]/40 outline-none focus:border-[#2EFF7B]"
                                                />
                                            </div>
                                        ) : (
                                            /* ── Normal chat row ── */
                                            <div className="flex items-center">
                                                <button
                                                    onClick={() => {
                                                        setIsMobileOpen(false);
                                                        router.push(`/chat?session=${chat.id}`);
                                                    }}
                                                    className="flex-1 flex items-center gap-3 px-3 py-2 text-sm text-[#8FAEA2] hover:text-[#E6F1EC] hover:bg-[#1A2420] rounded-xl transition-colors text-left min-w-0"
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#5A7268] flex-shrink-0" />
                                                    <span className="truncate">{chat.title}</span>
                                                </button>

                                                {/* Kebab ⋮ button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMenuOpenId(menuOpenId === chat.id ? null : chat.id);
                                                    }}
                                                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[#5A7268] hover:text-[#E6F1EC] hover:bg-[#1A2420] opacity-0 group-hover:opacity-100 transition-opacity"
                                                    aria-label="Chat options"
                                                >
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                                                    </svg>
                                                </button>

                                                {/* Dropdown menu */}
                                                {menuOpenId === chat.id && (
                                                    <div
                                                        ref={menuRef}
                                                        className="absolute right-0 top-full mt-1 w-40 bg-[#1A2420] border border-[#2A3F35] rounded-xl shadow-xl shadow-black/40 z-50 overflow-hidden"
                                                    >
                                                        <button
                                                            onClick={() => handleRenameStart(chat)}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#8FAEA2] hover:text-[#E6F1EC] hover:bg-[#253530] transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                            Rename
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(chat.id)}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-[#1F2D28]">
                    <div className="flex items-center justify-between text-xs text-[#5A7268]">
                        <span>ICA v1.0</span>
                        <span className="px-2 py-0.5 bg-[#1A2420] rounded-lg">Phase 6</span>
                    </div>
                </div>
            </aside>
        </>
    );
}
