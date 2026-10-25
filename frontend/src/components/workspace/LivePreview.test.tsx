import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LivePreview } from "./LivePreview";
import { apiClient, WorkspaceResponse } from "@/lib/api";

const workspace = {
    id: 1,
    name: "demo",
    status: "running",
    base_image: "node:20-bookworm",
    work_dir: "/workspace",
    created_at: new Date().toISOString(),
    ports: { "8000": 12345 },
} as WorkspaceResponse;

describe("LivePreview", () => {
    it("loads a token-scoped proxy URL", async () => {
        vi.spyOn(apiClient, "getWorkspacePreviewToken").mockResolvedValue({
            token: "tok",
            expires_in: 600,
        });

        render(<LivePreview workspace={workspace} isVisible />);

        await waitFor(() => {
            const iframe = document.querySelector("iframe");
            expect(iframe?.getAttribute("src")).toContain(
                "/workspace/1/proxy/tok/8000/"
            );
        });
    });

    it("shows the idle state when no ports are exposed", () => {
        render(
            <LivePreview
                workspace={{ ...workspace, ports: {} }}
                isVisible
            />
        );

        expect(screen.getByText("Live Preview Idle")).toBeInTheDocument();
    });

    it("offers direct mode on a local deployment", () => {
        render(
            <LivePreview
                workspace={workspace}
                isVisible
                allowDirect
            />
        );

        expect(screen.getByRole("button", { name: /direct/i })).toBeInTheDocument();
    });

    it("hides direct mode on a remote deployment", () => {
        render(
            <LivePreview
                workspace={workspace}
                isVisible
                allowDirect={false}
            />
        );

        expect(screen.queryByRole("button", { name: /direct/i })).not.toBeInTheDocument();
    });

    it("loads the mapped port directly in direct mode", async () => {
        render(
            <LivePreview
                workspace={workspace}
                isVisible
                allowDirect
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /direct/i }));

        await waitFor(() => {
            const iframe = document.querySelector("iframe");
            expect(iframe?.getAttribute("src")).toBe("http://127.0.0.1:12345/");
        });
    });
});
