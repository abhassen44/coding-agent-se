"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, ChevronLeft, ClipboardList, Shield, Users } from "lucide-react";
import { getJwtPayload, useAuthToken } from "@/lib/auth";

const NAV_ITEMS = [
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/stats", label: "Stats", icon: BarChart3 },
    { href: "/admin/logs", label: "Logs", icon: ClipboardList },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const token = useAuthToken();

    const accessState = useMemo(() => {
        if (!token) return "unauthorized";
        const payload = getJwtPayload(token);
        return payload?.role === "admin" ? "authorized" : "forbidden";
    }, [token]);

    useEffect(() => {
        if (accessState === "unauthorized") {
            router.replace("/login");
        } else if (accessState === "forbidden") {
            router.replace("/dashboard");
        }
    }, [accessState, router]);

    if (accessState !== "authorized") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-primary)]">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--accent-primary)] border-t-transparent" />
                    <span className="text-sm text-[color:var(--text-muted)]">Loading admin area</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[color:var(--bg-primary)]">
            <aside className="flex w-64 shrink-0 flex-col border-r border-[color:var(--border-color)] bg-[color:var(--bg-surface)]">
                <div className="border-b border-[color:var(--border-color)] px-5 py-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--accent-primary)]/30 bg-[color:var(--accent-primary)]/10 text-[color:var(--accent-primary)]">
                            <Shield className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold tracking-wide text-[color:var(--text-primary)]">ICA Admin</div>
                            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Control Panel</div>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 space-y-1 px-3 py-4">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${
                                    active
                                        ? "border border-[color:var(--accent-primary)]/30 bg-[color:var(--accent-primary)]/10 text-[color:var(--accent-primary)]"
                                        : "text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)]"
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="border-t border-[color:var(--border-color)] px-5 py-4">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 text-xs text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-secondary)]"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to app
                    </Link>
                </div>
            </aside>

            <main className="flex-1 overflow-auto">{children}</main>
        </div>
    );
}
