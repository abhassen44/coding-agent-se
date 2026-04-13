"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopNav from "./TopNav";

interface AppShellProps {
    children: React.ReactNode;
}

function getShellMode(pathname: string) {
    if (
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/workspace/") ||
        pathname.startsWith("/admin")
    ) {
        return { topNav: false, sidebar: false, mainClassName: "min-h-screen" };
    }

    if (pathname === "/") {
        return {
            topNav: true,
            sidebar: false,
            mainClassName: "mt-16 min-h-[calc(100vh-4rem)] overflow-x-hidden",
        };
    }

    return {
        topNav: true,
        sidebar: true,
        mainClassName: "mt-16 ml-0 md:ml-56 min-h-[calc(100vh-4rem)] overflow-x-hidden",
    };
}

export default function AppShell({ children }: AppShellProps) {
    const pathname = usePathname();
    const shellMode = useMemo(() => getShellMode(pathname), [pathname]);

    return (
        <>
            {shellMode.topNav ? <TopNav /> : null}
            {shellMode.sidebar ? <Sidebar /> : null}
            <main className={shellMode.mainClassName}>{children}</main>
        </>
    );
}
