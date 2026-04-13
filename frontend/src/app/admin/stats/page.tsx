"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, FolderGit2, RefreshCw, ServerCog, Users } from "lucide-react";
import { apiClient, AdminStatsResponse, getErrorMessage } from "@/lib/api";

interface StatCard {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    description: string;
}

export default function AdminStatsPage() {
    const [stats, setStats] = useState<AdminStatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchStats = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await apiClient.getAdminStats();
            setStats(response);
        } catch (errorValue) {
            setError(getErrorMessage(errorValue, "Failed to load stats"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    const cards: StatCard[] = stats
        ? [
              {
                  label: "Total Users",
                  value: stats.total_users,
                  icon: <Users className="h-7 w-7" />,
                  color: "border-[#2EFF7B]/30 bg-[#2EFF7B]/5",
                  description: `${stats.active_users} active`,
              },
              {
                  label: "Repositories",
                  value: stats.total_repos,
                  icon: <FolderGit2 className="h-7 w-7" />,
                  color: "border-blue-500/30 bg-blue-500/5",
                  description: "total imported",
              },
              {
                  label: "Workspaces",
                  value: stats.total_workspaces,
                  icon: <Activity className="h-7 w-7" />,
                  color: "border-purple-500/30 bg-purple-500/5",
                  description: "total created",
              },
              {
                  label: "Active Containers",
                  value: stats.active_containers,
                  icon: <ServerCog className="h-7 w-7" />,
                  color: "border-cyan-500/30 bg-cyan-500/5",
                  description: "running now",
              },
          ]
        : [];

    return (
        <div className="p-8 text-[#E6F1EC]">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="mb-1 text-2xl font-bold text-white">Stats</h1>
                    <p className="text-sm text-[#4A6355]">Auto-refreshes every 30 seconds</p>
                </div>
                <button
                    onClick={fetchStats}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#1A2820] bg-[#111917] px-4 py-2 text-sm text-[#8BA89A] transition-colors hover:border-[#2EFF7B]/30 hover:text-white disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    {loading ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {error ? (
                <div className="mb-6 rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            ) : null}

            {loading && !stats ? (
                <div className="flex items-center justify-center py-32">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2EFF7B] border-t-transparent" />
                </div>
            ) : (
                <>
                    <div className="mb-8 grid grid-cols-2 gap-4">
                        {cards.map((card) => (
                            <div key={card.label} className={`rounded-xl border ${card.color} bg-[#0D1210] p-6 transition-all hover:scale-[1.01]`}>
                                <div className="mb-4 flex items-start justify-between">
                                    <span className="text-[#E6F1EC]">{card.icon}</span>
                                    <span className="text-xs text-[#4A6355]">{card.description}</span>
                                </div>
                                <div className="mb-1 text-4xl font-bold text-white">{card.value.toLocaleString()}</div>
                                <div className="text-sm text-[#8BA89A]">{card.label}</div>
                            </div>
                        ))}
                    </div>

                    {stats ? (
                        <div className="rounded-xl border border-[#1A2820] bg-[#0D1210] p-6">
                            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#8BA89A]">User Activity</h2>
                            <div className="mb-2 flex items-center gap-4">
                                <span className="text-sm text-[#4A6355]">Active users</span>
                                <span className="ml-auto text-sm font-semibold text-white">
                                    {stats.active_users} / {stats.total_users}
                                </span>
                                <span className="text-sm text-[#2EFF7B]">
                                    {stats.total_users > 0 ? `${Math.round((stats.active_users / stats.total_users) * 100)}%` : "0%"}
                                </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-[#1A2820]">
                                <div
                                    className="h-2 rounded-full bg-[#2EFF7B] transition-all"
                                    style={{
                                        width: stats.total_users > 0 ? `${(stats.active_users / stats.total_users) * 100}%` : "0%",
                                    }}
                                />
                            </div>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
