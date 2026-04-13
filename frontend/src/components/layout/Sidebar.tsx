"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
    ChevronDown,
    FolderGit2,
    Menu,
    MessageSquare,
    MoreHorizontal,
    Pencil,
    Plus,
    TerminalSquare,
    Trash2,
    Upload,
    Wrench,
    X,
} from "lucide-react";
import { apiClient, ConversationListItem } from "@/lib/api";

const navItems = [
    { icon: MessageSquare, label: "Chat", href: "/chat" },
    { icon: TerminalSquare, label: "Execution", href: "/execute" },
    { icon: FolderGit2, label: "Repository", href: "/repository" },
    { icon: Wrench, label: "Workspace", href: "/workspace" },
    { icon: Upload, label: "Upload", href: "/upload" },
];

export interface RecentChat {
    id: string;
    title: string;
    timestamp: number;
}

function loadRecentChatsLocal(): RecentChat[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem("recent_chats");
        return raw ? (JSON.parse(raw) as RecentChat[]) : [];
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

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const response = await apiClient.listConversations();
                if (cancelled) return;

                setRecentChats(
                    response.conversations.slice(0, 5).map((conversation: ConversationListItem) => ({
                        id: String(conversation.id),
                        title: conversation.title || "Untitled",
                        timestamp: new Date(conversation.updated_at).getTime(),
                    })),
                );
            } catch {
                if (!cancelled) {
                    setRecentChats(loadRecentChatsLocal().slice(0, 5));
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [pathname, refreshKey]);

    useEffect(() => {
        const handler = () => setRefreshKey((current) => current + 1);
        window.addEventListener("conversation-updated", handler);
        return () => window.removeEventListener("conversation-updated", handler);
    }, []);

    useEffect(() => {
        const handler = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpenId(null);
            }
        };

        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        if (renamingId) {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }
    }, [renamingId]);

    const handleNewChat = () => {
        setIsMobileOpen(false);
        router.push(`/chat?new=${Date.now()}`);
    };

    const handleDelete = async (chatId: string) => {
        setMenuOpenId(null);
        try {
            await apiClient.deleteConversation(Number(chatId));
            setRecentChats((current) => current.filter((chat) => chat.id !== chatId));
            window.dispatchEvent(new CustomEvent("conversation-updated"));
        } catch (error) {
            console.error("Failed to delete conversation:", error);
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
            await apiClient.renameConversation(Number(chatId), trimmed);
            setRecentChats((current) =>
                current.map((chat) => (chat.id === chatId ? { ...chat, title: trimmed } : chat)),
            );
            window.dispatchEvent(new CustomEvent("conversation-updated"));
        } catch (error) {
            console.error("Failed to rename conversation:", error);
        }

        setRenamingId(null);
    };

    return (
        <>
            <button
                onClick={() => setIsMobileOpen((open) => !open)}
                className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--border-color)] bg-[color:var(--bg-surface)] md:hidden"
                aria-label="Toggle sidebar"
            >
                {isMobileOpen ? <X className="h-5 w-5 text-[color:var(--accent-primary)]" /> : <Menu className="h-5 w-5 text-[color:var(--accent-primary)]" />}
            </button>

            {isMobileOpen ? (
                <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setIsMobileOpen(false)} />
            ) : null}

            <aside
                className={`fixed left-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-56 flex-col border-r border-[color:var(--border-color)] bg-[color:var(--bg-surface)] transition-transform duration-300 ${
                    isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                }`}
            >
                <div className="p-4">
                    <button
                        onClick={handleNewChat}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--accent-primary)] px-4 py-3 font-semibold text-[color:var(--bg-primary)] transition-colors hover:bg-[color:var(--accent-secondary)]"
                    >
                        <Plus className="h-4 w-4" />
                        New Chat
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3">
                    <div className="mb-2 px-3 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Navigation</div>
                    <ul className="space-y-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href;

                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        onClick={() => setIsMobileOpen(false)}
                                        className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${
                                            isActive
                                                ? "border border-[color:var(--accent-primary)]/30 bg-[color:var(--accent-primary)]/10 text-[color:var(--accent-primary)]"
                                                : "text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span>{item.label}</span>
                                        {isActive ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[color:var(--accent-primary)]" /> : null}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="mt-6">
                        <div className="mb-2 flex items-center justify-between px-3 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                            <span>Recent</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                        </div>

                        {recentChats.length === 0 ? (
                            <p className="px-3 text-xs italic text-[color:var(--text-muted)]">No recent chats</p>
                        ) : (
                            <ul className="space-y-1">
                                {recentChats.map((chat) => (
                                    <li key={chat.id} className="group relative">
                                        {renamingId === chat.id ? (
                                            <div className="px-2 py-1">
                                                <input
                                                    ref={renameInputRef}
                                                    value={renameValue}
                                                    onChange={(event) => setRenameValue(event.target.value)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter") handleRenameSubmit(chat.id);
                                                        if (event.key === "Escape") setRenamingId(null);
                                                    }}
                                                    onBlur={() => handleRenameSubmit(chat.id)}
                                                    className="w-full rounded-xl border border-[color:var(--accent-primary)]/40 bg-[color:var(--bg-elevated)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex items-center">
                                                <button
                                                    onClick={() => {
                                                        setIsMobileOpen(false);
                                                        router.push(`/chat?session=${chat.id}`);
                                                    }}
                                                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
                                                >
                                                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[color:var(--text-muted)]" />
                                                    <span className="truncate">{chat.title}</span>
                                                </button>

                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setMenuOpenId((current) => (current === chat.id ? null : chat.id));
                                                    }}
                                                    className="mr-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[color:var(--text-muted)] opacity-0 transition-all hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)] group-hover:opacity-100"
                                                    aria-label="Conversation options"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>

                                                {menuOpenId === chat.id ? (
                                                    <div
                                                        ref={menuRef}
                                                        className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--bg-elevated)] shadow-xl shadow-black/40"
                                                    >
                                                        <button
                                                            onClick={() => handleRenameStart(chat)}
                                                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]"
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                            Rename
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(chat.id)}
                                                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            Delete
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </nav>

                <div className="border-t border-[color:var(--border-color)] p-4">
                    <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)]">
                        <span>ICA v1.0</span>
                        <span className="rounded-full bg-[color:var(--bg-elevated)] px-2 py-0.5">Phase 6</span>
                    </div>
                </div>
            </aside>
        </>
    );
}
