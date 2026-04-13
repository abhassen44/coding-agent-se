"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { apiClient, AdminLogItem, getErrorMessage } from "@/lib/api";

const ACTION_OPTIONS = [
    "USER_LOGIN",
    "USER_BANNED",
    "USER_ROLE_CHANGED",
    "USER_DELETED",
    "REPO_CREATED",
    "REPO_DELETED",
    "AGENT_RUN",
    "WORKSPACE_CREATED",
    "WORKSPACE_DELETED",
    "ERROR",
];

const ACTION_COLORS: Record<string, string> = {
    USER_LOGIN: "text-blue-400 bg-blue-900/20",
    USER_BANNED: "text-orange-400 bg-orange-900/20",
    USER_ROLE_CHANGED: "text-yellow-400 bg-yellow-900/20",
    USER_DELETED: "text-red-400 bg-red-900/20",
    REPO_CREATED: "text-emerald-400 bg-emerald-900/20",
    REPO_DELETED: "text-red-400 bg-red-900/20",
    AGENT_RUN: "text-purple-400 bg-purple-900/20",
    WORKSPACE_CREATED: "text-cyan-400 bg-cyan-900/20",
    WORKSPACE_DELETED: "text-red-400 bg-red-900/20",
    ERROR: "text-red-500 bg-red-900/30",
};

const LIMIT = 50;

export default function AdminLogsPage() {
    const [logs, setLogs] = useState<AdminLogItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState("");
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await apiClient.getAdminLogs({
                action: actionFilter || undefined,
                page,
                limit: LIMIT,
            });
            setLogs(response.logs);
            setTotal(response.total);
        } catch (errorValue) {
            setError(getErrorMessage(errorValue, "Failed to load logs"));
        } finally {
            setLoading(false);
        }
    }, [actionFilter, page]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="p-8 text-[#E6F1EC]">
            <div className="mb-8">
                <h1 className="mb-1 text-2xl font-bold text-white">Activity Logs</h1>
                <p className="text-sm text-[#4A6355]">{total} total events</p>
            </div>

            <div className="mb-6 flex flex-wrap gap-3">
                <select
                    value={actionFilter}
                    onChange={(event) => {
                        setActionFilter(event.target.value);
                        setPage(1);
                    }}
                    className="appearance-none rounded-lg border border-[#1F2D28] bg-[#111917] px-4 py-2 text-sm text-[#E6F1EC] focus:border-[#2EFF7B]/50 focus:outline-none"
                >
                    <option value="">All Actions</option>
                    {ACTION_OPTIONS.map((action) => (
                        <option key={action} value={action}>
                            {action}
                        </option>
                    ))}
                </select>

                {actionFilter ? (
                    <button
                        onClick={() => {
                            setActionFilter("");
                            setPage(1);
                        }}
                        className="rounded-lg border border-[#1F2D28] bg-[#111917] px-4 py-2 text-sm text-[#8BA89A] transition-colors hover:text-white"
                    >
                        Clear Filter
                    </button>
                ) : null}
            </div>

            {error ? (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-[#1A2820] bg-[#0D1210]">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-[#1A2820] text-xs uppercase tracking-wider text-[#4A6355]">
                            <th className="px-5 py-3 text-left">Timestamp</th>
                            <th className="px-5 py-3 text-left">User</th>
                            <th className="px-5 py-3 text-left">Action</th>
                            <th className="px-5 py-3 text-right">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="py-16 text-center">
                                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#2EFF7B] border-t-transparent" />
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="py-16 text-center text-[#4A6355]">
                                    No logs found
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <Fragment key={log.id}>
                                    <tr
                                        className="cursor-pointer border-b border-[#111917] transition-colors hover:bg-[#111917]/60"
                                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                                    >
                                        <td className="whitespace-nowrap px-5 py-3 text-xs text-[#4A6355]">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-3 text-xs text-[#8BA89A]">
                                            {log.user_email || (log.user_id ? `#${log.user_id}` : "System")}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[log.action] || "bg-[#1A2820] text-[#8BA89A]"}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right text-xs text-[#4A6355]">
                                            {Object.keys(log.metadata).length > 0 ? (
                                                <span className="hover:text-[#8BA89A]">{expandedId === log.id ? "Hide details" : "Show details"}</span>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                    </tr>
                                    {expandedId === log.id && Object.keys(log.metadata).length > 0 ? (
                                        <tr className="border-b border-[#111917] bg-[#0A0F0D]">
                                            <td colSpan={4} className="px-5 py-3">
                                                <pre className="overflow-x-auto font-mono text-xs text-[#8BA89A]">
                                                    {JSON.stringify(log.metadata, null, 2)}
                                                </pre>
                                            </td>
                                        </tr>
                                    ) : null}
                                </Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 ? (
                <div className="mt-4 flex items-center justify-between text-sm text-[#4A6355]">
                    <span>
                        Page {page} of {totalPages} - {total} events
                    </span>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage((current) => current - 1)}
                            className="rounded border border-[#1A2820] bg-[#111917] px-3 py-1 transition-colors hover:border-[#2EFF7B]/30 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Prev
                        </button>
                        <button
                            disabled={page === totalPages}
                            onClick={() => setPage((current) => current + 1)}
                            className="rounded border border-[#1A2820] bg-[#111917] px-3 py-1 transition-colors hover:border-[#2EFF7B]/30 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
