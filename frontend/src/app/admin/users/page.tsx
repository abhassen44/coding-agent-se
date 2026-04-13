"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient, AdminUser, getErrorMessage } from "@/lib/api";

type Action = "ban" | "unban" | "promote" | "demote" | "delete";

const LIMIT = 20;

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await apiClient.getAdminUsers({ search, page, limit: LIMIT });
            setUsers(response.users);
            setTotal(response.total);
        } catch (errorValue) {
            setError(getErrorMessage(errorValue, "Failed to load users"));
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const act = async (userId: number, action: Action) => {
        setActionLoading(userId);
        try {
            if (action === "ban") await apiClient.banUser(userId, true);
            if (action === "unban") await apiClient.banUser(userId, false);
            if (action === "promote") await apiClient.changeUserRole(userId, "admin");
            if (action === "demote") await apiClient.changeUserRole(userId, "user");
            if (action === "delete") {
                await apiClient.deleteAdminUser(userId);
                setConfirmDelete(null);
            }
            await fetchUsers();
        } catch (errorValue) {
            setError(getErrorMessage(errorValue, "Action failed"));
        } finally {
            setActionLoading(null);
        }
    };

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="p-8 text-[#E6F1EC]">
            <div className="mb-8">
                <h1 className="mb-1 text-2xl font-bold text-white">Users</h1>
                <p className="text-sm text-[#4A6355]">{total} total users</p>
            </div>

            <div className="mb-6 flex gap-3">
                <input
                    type="text"
                    placeholder="Search by email..."
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            setSearch(searchInput);
                            setPage(1);
                        }
                    }}
                    className="w-80 rounded-lg border border-[#1F2D28] bg-[#111917] px-4 py-2 text-sm text-[#E6F1EC] placeholder-[#4A6355] focus:border-[#2EFF7B]/50 focus:outline-none"
                />
                <button
                    onClick={() => {
                        setSearch(searchInput);
                        setPage(1);
                    }}
                    className="rounded-lg bg-[#2EFF7B] px-4 py-2 text-sm font-semibold text-[#0B0F0E] transition-colors hover:bg-[#25CC62]"
                >
                    Search
                </button>
                {search ? (
                    <button
                        onClick={() => {
                            setSearch("");
                            setSearchInput("");
                            setPage(1);
                        }}
                        className="rounded-lg border border-[#1F2D28] bg-[#111917] px-4 py-2 text-sm text-[#8BA89A] transition-colors hover:text-white"
                    >
                        Clear
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
                            <th className="px-5 py-3 text-left">Email</th>
                            <th className="px-5 py-3 text-left">Name</th>
                            <th className="px-5 py-3 text-left">Role</th>
                            <th className="px-5 py-3 text-left">Status</th>
                            <th className="px-5 py-3 text-left">Joined</th>
                            <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="py-16 text-center text-[#4A6355]">
                                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#2EFF7B] border-t-transparent" />
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-16 text-center text-[#4A6355]">
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id} className="border-b border-[#111917] transition-colors hover:bg-[#111917]/60">
                                    <td className="px-5 py-3 font-medium text-[#E6F1EC]">{user.email}</td>
                                    <td className="px-5 py-3 text-[#8BA89A]">{user.full_name || "-"}</td>
                                    <td className="px-5 py-3">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                user.role === "admin"
                                                    ? "bg-[#2EFF7B]/10 text-[#2EFF7B]"
                                                    : "bg-[#1A2820] text-[#8BA89A]"
                                            }`}
                                        >
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                user.is_active
                                                    ? "bg-emerald-900/30 text-emerald-400"
                                                    : "bg-red-900/30 text-red-400"
                                            }`}
                                        >
                                            {user.is_active ? "Active" : "Banned"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-[#4A6355]">{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td className="px-5 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {actionLoading === user.id ? (
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2EFF7B] border-t-transparent" />
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => act(user.id, user.is_active ? "ban" : "unban")}
                                                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                                            user.is_active
                                                                ? "bg-orange-900/30 text-orange-400 hover:bg-orange-900/50"
                                                                : "bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"
                                                        }`}
                                                    >
                                                        {user.is_active ? "Ban" : "Unban"}
                                                    </button>
                                                    <button
                                                        onClick={() => act(user.id, user.role === "admin" ? "demote" : "promote")}
                                                        className="rounded bg-[#1A2820] px-2.5 py-1 text-xs font-medium text-[#8BA89A] transition-colors hover:text-white"
                                                    >
                                                        {user.role === "admin" ? "Demote" : "Promote"}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDelete(user)}
                                                        className="rounded bg-red-900/20 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/40"
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 ? (
                <div className="mt-4 flex items-center justify-between text-sm text-[#4A6355]">
                    <span>
                        Page {page} of {totalPages}
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

            {confirmDelete ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-96 rounded-xl border border-[#1A2820] bg-[#0D1210] p-6">
                        <h3 className="mb-2 font-semibold text-white">Delete User</h3>
                        <p className="mb-6 text-sm text-[#8BA89A]">
                            This will permanently delete <strong className="text-white">{confirmDelete.email}</strong> and all associated data.
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="rounded-lg border border-[#1A2820] bg-[#111917] px-4 py-2 text-sm text-[#8BA89A] transition-colors hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => act(confirmDelete.id, "delete")}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
