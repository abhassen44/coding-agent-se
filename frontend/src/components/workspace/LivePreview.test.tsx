import { render, screen, waitFor } from "@testing-library/react";
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
});
