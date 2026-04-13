"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Bell,
    ChevronRight,
    FolderGit2,
    History,
    LayoutDashboard,
    LogOut,
    MessageSquare,
    Search,
    Settings,
    TerminalSquare,
    Upload,
    UserCircle2,
    Wrench,
    X,
} from "lucide-react";
import { clearStoredAuth, useIsLoggedIn } from "@/lib/auth";

interface Suggestion {
    type: "recent" | "page" | "repo";
    label: string;
    sublabel?: string;
    href?: string;
    query?: string;
    icon: React.ReactNode;
}

interface RepoSuggestion {
    id: number;
    name: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const RECENT_SEARCHES_KEY = "recent_searches";

const PAGES = [
    { label: "Chat", href: "/chat", icon: <MessageSquare className="h-4 w-4" /> },
    { label: "Repository", href: "/repository", icon: <FolderGit2 className="h-4 w-4" /> },
    { label: "Workspace", href: "/workspace", icon: <Wrench className="h-4 w-4" /> },
    { label: "Upload Files", href: "/upload", icon: <Upload className="h-4 w-4" /> },
    { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { label: "Execution", href: "/execute", icon: <TerminalSquare className="h-4 w-4" /> },
] as const;

function readRecentSearches() {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
        return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
        return [];
    }
}

export default function TopNav() {
    const [searchQuery, setSearchQuery] = useState("");
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const [repos, setRepos] = useState<RepoSuggestion[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches());
    const isLoggedIn = useIsLoggedIn();
    const router = useRouter();
    const searchRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isLoggedIn) return;

        const token = window.localStorage.getItem("auth_token");
        if (!token) return;

        fetch(`${API_BASE}/repo`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async (response) => {
                if (!response.ok) return null;
                return response.json() as Promise<{ repositories?: RepoSuggestion[] }>;
            })
            .then((data) => {
                if (data?.repositories) {
                    setRepos(data.repositories);
                }
            })
            .catch(() => undefined);
    }, [isLoggedIn]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                searchRef.current?.focus();
                setShowSuggestions(true);
                return;
            }

            if (event.key === "Escape") {
                setShowSuggestions(false);
                setSelectedIdx(-1);
                searchRef.current?.blur();
            }
        };

        const handleStorageRefresh = () => {
            setRecentSearches(readRecentSearches());
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("storage", handleStorageRefresh);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("storage", handleStorageRefresh);
        };
    }, []);

    useEffect(() => {
        const handler = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                !searchRef.current?.contains(event.target as Node)
            ) {
                setShowSuggestions(false);
                setSelectedIdx(-1);
            }
        };

        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const suggestions = useMemo<Suggestion[]>(() => {
        const query = searchQuery.trim().toLowerCase();

        if (!query) {
            return [
                ...recentSearches.slice(0, 4).map((value) => ({
                    type: "recent" as const,
                    label: value,
                    query: value,
                    icon: <History className="h-4 w-4" />,
                })),
                ...PAGES.map((page) => ({
                    type: "page" as const,
                    label: page.label,
                    sublabel: page.href,
                    href: page.href,
                    icon: page.icon,
                })),
            ];
        }

        return [
            ...PAGES.filter((page) => page.label.toLowerCase().includes(query)).map((page) => ({
                type: "page" as const,
                label: page.label,
                sublabel: page.href,
                href: page.href,
                icon: page.icon,
            })),
            ...(isLoggedIn ? repos : [])
                .filter((repo) => repo.name.toLowerCase().includes(query))
                .map((repo) => ({
                    type: "repo" as const,
                    label: repo.name,
                    sublabel: "Repository",
                    href: "/repository",
                    icon: <FolderGit2 className="h-4 w-4" />,
                })),
            ...recentSearches
                .filter((value) => value.toLowerCase().includes(query))
                .map((value) => ({
                    type: "recent" as const,
                    label: value,
                    query: value,
                    icon: <History className="h-4 w-4" />,
                })),
            {
                type: "recent" as const,
                label: `Ask AI: "${searchQuery.trim()}"`,
                query: searchQuery.trim(),
                icon: <MessageSquare className="h-4 w-4" />,
            },
        ];
    }, [isLoggedIn, recentSearches, repos, searchQuery]);

    const persistRecentSearches = useCallback((nextValues: string[]) => {
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextValues));
        setRecentSearches(nextValues);
    }, []);

    const saveSearch = useCallback((query: string) => {
        const normalized = query.trim();
        if (!normalized) return;

        const nextValues = [
            normalized,
            ...recentSearches.filter((value) => value !== normalized),
        ].slice(0, 8);

        persistRecentSearches(nextValues);
    }, [persistRecentSearches, recentSearches]);

    const clearSearch = useCallback((query: string) => {
        persistRecentSearches(recentSearches.filter((value) => value !== query));
    }, [persistRecentSearches, recentSearches]);

    const executeSuggestion = useCallback((suggestion: Suggestion) => {
        setShowSuggestions(false);
        setSearchQuery("");

        if (suggestion.type === "page" || suggestion.type === "repo") {
            router.push(suggestion.href || "/");
            return;
        }

        if (suggestion.query) {
            saveSearch(suggestion.query);
            router.push(`/chat?q=${encodeURIComponent(suggestion.query)}`);
        }
    }, [router, saveSearch]);

    const handleSearch = (event: React.FormEvent) => {
        event.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;

        saveSearch(query);
        setSearchQuery("");
        setShowSuggestions(false);
        router.push(`/chat?q=${encodeURIComponent(query)}`);
    };

    const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions || suggestions.length === 0) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIdx((current) => Math.min(current + 1, suggestions.length - 1));
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIdx((current) => Math.max(current - 1, -1));
            return;
        }

        if (event.key === "Enter" && selectedIdx >= 0) {
            event.preventDefault();
            executeSuggestion(suggestions[selectedIdx]);
        }
    };

    const handleLogout = () => {
        clearStoredAuth();
        setShowUserMenu(false);
        router.push("/login");
    };

    const groupedSuggestions = useMemo(() => {
        return [
            { title: "Recent Searches", type: "recent" as const },
            { title: "Pages", type: "page" as const },
            { title: "Repositories", type: "repo" as const },
        ].map((group) => ({
            ...group,
            items: suggestions.filter((suggestion) => suggestion.type === group.type),
        }));
    }, [suggestions]);

    return (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-[color:var(--border-color)] bg-[color:var(--bg-primary)]/95 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 md:px-6">
                <Link href="/" className="flex shrink-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--accent-primary)]/30 bg-[color:var(--accent-primary)]/10 text-[color:var(--accent-primary)]">
                        <Wrench className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">ICA</span>
                        <span className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Coding Agent</span>
                    </div>
                </Link>

                <div className="relative mx-4 hidden max-w-2xl flex-1 md:block">
                    <form onSubmit={handleSearch}>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]" />
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="Search pages, repos, and prompts"
                                value={searchQuery}
                                onChange={(event) => {
                                    setSearchQuery(event.target.value);
                                    setSelectedIdx(-1);
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onKeyDown={handleInputKeyDown}
                                className="w-full rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--bg-surface)] px-11 py-3 pr-20 text-sm text-[color:var(--text-primary)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent-primary)]"
                            />
                            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                                {searchQuery ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery("");
                                            searchRef.current?.focus();
                                        }}
                                        className="rounded-full bg-[color:var(--bg-elevated)] p-1 text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-primary)]"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                ) : (
                                    <kbd className="rounded-md border border-[color:var(--border-color)] bg-[color:var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)]">
                                        Ctrl+K
                                    </kbd>
                                )}
                            </div>
                        </div>
                    </form>

                    {showSuggestions && suggestions.length > 0 ? (
                        <div
                            ref={dropdownRef}
                            className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--bg-surface)] shadow-2xl shadow-black/40"
                        >
                            {groupedSuggestions.map((group) => {
                                if (group.items.length === 0) return null;

                                return (
                                    <div key={group.type}>
                                        <div className="border-b border-[color:var(--border-color)] bg-[color:var(--bg-primary)]/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                                            {group.title}
                                        </div>
                                        {group.items.map((item) => {
                                            const index = suggestions.indexOf(item);
                                            const isSelected = index === selectedIdx;

                                            return (
                                                <div
                                                    key={`${item.type}-${item.label}`}
                                                    onMouseDown={() => executeSuggestion(item)}
                                                    onMouseEnter={() => setSelectedIdx(index)}
                                                    className={`group flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors ${
                                                        isSelected ? "bg-[color:var(--accent-primary)]/10" : "hover:bg-[color:var(--bg-elevated)]"
                                                    }`}
                                                >
                                                    <span className={`flex h-8 w-8 items-center justify-center rounded-xl border ${
                                                        isSelected
                                                            ? "border-[color:var(--accent-primary)]/40 text-[color:var(--accent-primary)]"
                                                            : "border-[color:var(--border-color)] text-[color:var(--text-secondary)]"
                                                    }`}>
                                                        {item.icon}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className={`truncate text-sm ${isSelected ? "text-[color:var(--accent-primary)]" : "text-[color:var(--text-primary)]"}`}>
                                                            {item.label}
                                                        </div>
                                                        {item.sublabel ? (
                                                            <div className="truncate text-xs text-[color:var(--text-muted)]">{item.sublabel}</div>
                                                        ) : null}
                                                    </div>
                                                    {item.type === "recent" && item.query ? (
                                                        <button
                                                            type="button"
                                                            onMouseDown={(event) => {
                                                                event.stopPropagation();
                                                                clearSearch(item.query as string);
                                                            }}
                                                            className="rounded-full p-1 text-[color:var(--text-muted)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                                                            aria-label="Remove recent search"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    ) : (
                                                        <ChevronRight className={`h-4 w-4 ${isSelected ? "text-[color:var(--accent-primary)]" : "text-[color:var(--text-muted)]"}`} />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                            <div className="flex items-center justify-between border-t border-[color:var(--border-color)] px-3 py-2 text-[10px] text-[color:var(--text-muted)]">
                                <span>Use arrow keys to navigate</span>
                                <span>Enter to open</span>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <button className="rounded-xl p-2 text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]" aria-label="Notifications">
                        <Bell className="h-4 w-4" />
                    </button>
                    <button className="rounded-xl p-2 text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]" aria-label="Settings">
                        <Settings className="h-4 w-4" />
                    </button>
                    <div className="mx-1 hidden h-8 w-px bg-[color:var(--border-color)] sm:block" />

                    {isLoggedIn ? (
                        <div className="relative">
                            <button
                                onClick={() => setShowUserMenu((open) => !open)}
                                className="flex items-center gap-2 rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--bg-surface)] px-3 py-1.5 transition-colors hover:border-[color:var(--accent-primary)]/40"
                            >
                                <UserCircle2 className="h-7 w-7 text-[color:var(--accent-primary)]" />
                            </button>

                            {showUserMenu ? (
                                <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--bg-surface)] shadow-2xl shadow-black/40">
                                    <Link
                                        href="/dashboard"
                                        onClick={() => setShowUserMenu(false)}
                                        className="flex items-center gap-2 px-4 py-3 text-sm text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
                                    >
                                        <LayoutDashboard className="h-4 w-4" />
                                        Dashboard
                                    </Link>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
                                    >
                                        <Settings className="h-4 w-4" />
                                        Settings
                                    </button>
                                    <hr className="border-[color:var(--border-color)]" />
                                    <button
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                                    >
                                        <LogOut className="h-4 w-4" />
                                        Sign out
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="rounded-2xl bg-[color:var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[color:var(--bg-primary)] transition-colors hover:bg-[color:var(--accent-secondary)]"
                        >
                            Sign in
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
