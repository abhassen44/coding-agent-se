"use client";

import { useSyncExternalStore } from "react";

const AUTH_EVENT = "ica-auth-change";

export interface AuthTokens {
    accessToken: string;
    refreshToken?: string | null;
}

function emitAuthChange() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(AUTH_EVENT));
}

function subscribe(callback: () => void) {
    if (typeof window === "undefined") {
        return () => undefined;
    }

    const handler = () => callback();
    window.addEventListener(AUTH_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
        window.removeEventListener(AUTH_EVENT, handler);
        window.removeEventListener("storage", handler);
    };
}

export function getStoredAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("auth_token");
}

export function setStoredAuthTokens(tokens: AuthTokens) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("auth_token", tokens.accessToken);
    if (tokens.refreshToken) {
        window.localStorage.setItem("refresh_token", tokens.refreshToken);
    } else {
        window.localStorage.removeItem("refresh_token");
    }
    emitAuthChange();
}

export function clearStoredAuth() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("auth_token");
    window.localStorage.removeItem("refresh_token");
    emitAuthChange();
}

export function useAuthToken() {
    return useSyncExternalStore(subscribe, getStoredAuthToken, () => null);
}

export function useIsLoggedIn() {
    return Boolean(useAuthToken());
}

export function getJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(window.atob(normalized)) as Record<string, unknown>;
    } catch {
        return null;
    }
}
