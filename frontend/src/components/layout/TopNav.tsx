"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

interface Suggestion {
    type: "recent" | "page" | "repo";
    label: string;
    sublabel?: string;
    href?: string;
    query?: string;
    icon: React.ReactNode;
}

const PAGES: { label: string; href: string; icon: string }[] = [
    { label: "Chat", href: "/chat", icon: "💬" },
    { label: "Repository", href: "/repository", icon: "📁" },
    { label: "Workspace", href: "/workspace", icon: "🖥️" },
    { label: "Upload Files", href: "/upload", icon: "⬆️" },
    { label: "Dashboard", href: "/dashboard", icon: "📊" },
    { label: "Execution", href: "/execute", icon: "⚡" },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function TopNav() {
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const [repos, setRepos] = useState<{ id: number; name: string }[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const pathname = usePathname();
    const router = useRouter();
    const searchRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const token = localStorage.getItem("auth_token");
        setIsLoggedIn(!!token);
        // Load recent searches
        try {
            const raw = localStorage.getItem("recent_searches");
            setRecentSearches(raw ? JSON.parse(raw) : []);
        } catch { setRecentSearches([]); }
    }, [pathname]);

    // Fetch repos for suggestions
    useEffect(() => {
        const token = localStorage.getItem("auth_token");
        if (!token) return;
        fetch(`${API_BASE}/repo`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.repositories) setRepos(d.repositories); })
            .catch(() => { });
    }, [isLoggedIn]);

    // Global keyboard shortcut (Cmd/Ctrl + K) to focus search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                searchRef.current?.focus();
                setShowSuggestions(true);
            }
            if (e.key === "Escape") {
                setShowSuggestions(false);
                setSelectedIdx(-1);
                searchRef.current?.blur();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                !searchRef.current?.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
                setSelectedIdx(-1);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Build suggestions whenever query changes
    useEffect(() => {
        const q = searchQuery.trim().toLowerCase();
        const results: Suggestion[] = [];

        if (!q) {
            // Show recents first, then pages
            recentSearches.slice(0, 4).forEach(s => {
                results.push({
                    type: "recent",
                    label: s,
                    icon: <span>🕐</span>,
                    query: s,
                });
            });
            PAGES.forEach(p => {
                results.push({
                    type: "page",
                    label: p.label,
                    sublabel: p.href,
                    href: p.href,
                    icon: <span>{p.icon}</span>,
                });
            });
        } else {
            // Filter pages
            PAGES.filter(p => p.label.toLowerCase().includes(q)).forEach(p => {
                results.push({
                    type: "page",
                    label: p.label,
                    sublabel: p.href,
                    href: p.href,
                    icon: <span>{p.icon}</span>,
                });
            });
            // Filter repos
            repos.filter(r => r.name.toLowerCase().includes(q)).forEach(r => {
                results.push({
                    type: "repo",
                    label: r.name,
                    sublabel: "Repository",
                    href: `/repository`,
                    icon: <span>📁</span>,
                });
            });
            // Filter recent searches
            recentSearches.filter(s => s.toLowerCase().includes(q)).forEach(s => {
                results.push({
                    type: "recent",
                    label: s,
                    icon: <span>🕐</span>,
                    query: s,
                });
            });
            // Always add a "Search in chat" option at the bottom if there's a query
            results.push({
                type: "recent",
                label: `Ask AI: "${searchQuery.trim()}"`,
                icon: <span>💬</span>,
                query: searchQuery.trim(),
            });
        }

        setSuggestions(results);
        setSelectedIdx(-1);
    }, [searchQuery, repos, recentSearches]);

    const saveSearch = (q: string) => {
        try {
            const raw = localStorage.getItem("recent_searches");
            const existing: string[] = raw ? JSON.parse(raw) : [];
            const filtered = existing.filter(s => s !== q);
            filtered.unshift(q);
            const updated = filtered.slice(0, 8);
            localStorage.setItem("recent_searches", JSON.stringify(updated));
            setRecentSearches(updated);
        } catch { }
    };

    const executeSuggestion = useCallback((s: Suggestion) => {
        setShowSuggestions(false);
        setSearchQuery("");
        if (s.type === "page" || s.type === "repo") {
            router.push(s.href!);
        } else if (s.query) {
            saveSearch(s.query);
            router.push(`/chat?q=${encodeURIComponent(s.query)}`);
        }
    }, [router]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const q = searchQuery.trim();
        if (!q) return;
        setShowSuggestions(false);
        setSearchQuery("");
        saveSearch(q);
        router.push(`/chat?q=${encodeURIComponent(q)}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions || suggestions.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIdx(i => Math.max(i - 1, -1));
        } else if (e.key === "Enter" && selectedIdx >= 0) {
            e.preventDefault();
            executeSuggestion(suggestions[selectedIdx]);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("refresh_token");
        setIsLoggedIn(false);
        setShowUserMenu(false);
        router.push("/login");
    };

    const clearSearch = (q: string) => {
        try {
            const raw = localStorage.getItem("recent_searches");
            const existing: string[] = raw ? JSON.parse(raw) : [];
            const updated = existing.filter(s => s !== q);
            localStorage.setItem("recent_searches", JSON.stringify(updated));
            setRecentSearches(updated);
        } catch { }
    };

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-[#0B0F0E] border-b border-[#1F2D28] z-50">
            <div className="h-full flex items-center justify-between px-6 max-w-full">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-9 h-9 bg-[#2EFF7B] rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#0B0F0E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-lg text-[#E6F1EC] tracking-tight">ICA</span>
                        <span className="text-[10px] text-[#5A7268] -mt-1 tracking-wider uppercase">Coding Agent</span>
                    </div>
                </Link>

                {/* Search */}
                <div className="flex-1 max-w-xl mx-8 relative">
                    <form onSubmit={handleSearch}>
                        <div className="relative">
                            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7268]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="Search chats, repos, workspaces..."
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                                onFocus={() => setShowSuggestions(true)}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-[#111917] text-[#E6F1EC] placeholder-[#5A7268] rounded-xl px-4 py-2.5 pl-11 pr-16 text-sm border border-[#1F2D28] focus:border-[#2EFF7B] focus:outline-none transition-colors"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                {searchQuery ? (
                                    <button type="button" onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }} className="w-5 h-5 rounded-full bg-[#1A2420] flex items-center justify-center text-[#5A7268] hover:text-[#E6F1EC] transition-colors text-xs">✕</button>
                                ) : (
                                    <kbd className="px-1.5 py-0.5 text-[10px] text-[#5A7268] bg-[#1A2420] rounded border border-[#1F2D28]">⌘K</kbd>
                                )}
                            </div>
                        </div>
                    </form>

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div
                            ref={dropdownRef}
                            className="absolute top-full left-0 right-0 mt-2 bg-[#111917] border border-[#1F2D28] rounded-xl shadow-2xl overflow-hidden z-[200]"
                        >
                            {/* Group headers */}
                            {(() => {
                                const groups: { title: string; type: Suggestion["type"] }[] = [
                                    { title: "Recent Searches", type: "recent" },
                                    { title: "Pages", type: "page" },
                                    { title: "Repositories", type: "repo" },
                                ];
                                let flatIdx = 0;
                                return groups.map(group => {
                                    const items = suggestions.filter(s => s.type === group.type);
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={group.type}>
                                            <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#5A7268] bg-[#0B0F0E]/50 border-b border-[#1F2D28]">
                                                {group.title}
                                            </div>
                                            {items.map(item => {
                                                const thisIdx = suggestions.indexOf(item);
                                                const isSelected = thisIdx === selectedIdx;
                                                return (
                                                    <div
                                                        key={`${item.type}-${item.label}`}
                                                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group ${isSelected ? "bg-[#2EFF7B]/10" : "hover:bg-[#1A2420]"}`}
                                                        onMouseDown={() => executeSuggestion(item)}
                                                        onMouseEnter={() => setSelectedIdx(thisIdx)}
                                                    >
                                                        <span className="text-base w-5 flex-shrink-0 text-center">{item.icon}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className={`text-sm truncate ${isSelected ? "text-[#2EFF7B]" : "text-[#E6F1EC]"}`}>
                                                                {item.label}
                                                            </div>
                                                            {item.sublabel && (
                                                                <div className="text-xs text-[#5A7268] truncate">{item.sublabel}</div>
                                                            )}
                                                        </div>
                                                        {item.type === "recent" && item.query && (
                                                            <button
                                                                type="button"
                                                                onMouseDown={e => { e.stopPropagation(); clearSearch(item.query!); }}
                                                                className="opacity-0 group-hover:opacity-100 text-[#5A7268] hover:text-red-400 text-xs px-1 transition-all"
                                                                title="Remove"
                                                            >✕</button>
                                                        )}
                                                        {(item.type === "page" || item.type === "repo") && (
                                                            <svg className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-[#2EFF7B]" : "text-[#5A7268]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                });
                            })()}
                            <div className="px-3 py-2 border-t border-[#1F2D28] flex items-center justify-between">
                                <span className="text-[10px] text-[#5A7268]">↑↓ navigate · Enter select · Esc close</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Notifications */}
                    <button className="p-2 text-[#8FAEA2] hover:text-[#E6F1EC] hover:bg-[#111917] rounded-xl transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </button>

                    {/* Settings */}
                    <button className="p-2 text-[#8FAEA2] hover:text-[#E6F1EC] hover:bg-[#111917] rounded-xl transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>

                    {/* Divider */}
                    <div className="w-px h-8 bg-[#1F2D28]" />

                    {/* User */}
                    {isLoggedIn ? (
                        <div className="relative z-[100]">
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="flex items-center gap-2 p-1.5 hover:bg-[#111917] rounded-xl transition-colors"
                            >
                                <div className="w-8 h-8 bg-[#2EFF7B] rounded-lg flex items-center justify-center">
                                    <span className="text-[#0B0F0E] text-sm font-semibold">U</span>
                                </div>
                            </button>

                            {showUserMenu && (
                                <div className="absolute right-0 top-full mt-2 w-44 bg-[#111917] border border-[#1F2D28] rounded-xl shadow-2xl py-1 z-[100]">
                                    <Link
                                        href="/dashboard"
                                        onClick={() => setShowUserMenu(false)}
                                        className="block w-full px-4 py-2 text-sm text-[#8FAEA2] hover:text-[#E6F1EC] hover:bg-[#1A2420] text-left transition-colors"
                                    >
                                        Dashboard
                                    </Link>
                                    <button className="w-full px-4 py-2 text-sm text-[#8FAEA2] hover:text-[#E6F1EC] hover:bg-[#1A2420] text-left transition-colors">
                                        Settings
                                    </button>
                                    <hr className="my-1 border-[#1F2D28]" />
                                    <button onClick={handleLogout} className="w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 text-left transition-colors">
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link href="/login" className="px-4 py-2 bg-[#2EFF7B] text-[#0B0F0E] text-sm font-semibold rounded-xl hover:bg-[#1ED760] transition-colors">
                            Sign in
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
