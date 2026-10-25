import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatInterface from "./ChatInterface";
import { apiClient } from "@/lib/api";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
    useSearchParams: () => ({ get: () => null }),
    useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock("./MessageBubble", () => ({
    default: ({ message }: { message: { content: string } }) => (
        <div>{message.content}</div>
    ),
}));

describe("ChatInterface streaming", () => {
    beforeEach(() => {
        localStorage.setItem("auth_token", "test-token");
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ repositories: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            )
        );
    });

    it("streams an assistant response", async () => {
        const streamSpy = vi
            .spyOn(apiClient, "streamMessage")
            .mockImplementation(async (_request, onChunk, onComplete, _onError, onStart) => {
                onStart?.({ conversationId: 9, sessionId: "s1" });
                onChunk("hello");
                onComplete();
                return { conversationId: 9, sessionId: "s1" };
            });

        render(<ChatInterface />);
        fireEvent.change(screen.getByPlaceholderText("Ask me anything about code..."), {
            target: { value: "hi" },
        });
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));

        await waitFor(() => {
            expect(streamSpy).toHaveBeenCalled();
            expect(screen.getByText("hello")).toBeInTheDocument();
        });
    });

    it("falls back to blocking chat only when no chunks arrived", async () => {
        vi.spyOn(apiClient, "streamMessage").mockImplementation(
            async (_request, _onChunk, _onComplete, onError) => {
                onError(new Error("stream failed"));
                return { conversationId: null, sessionId: null };
            }
        );
        const sendSpy = vi.spyOn(apiClient, "sendMessage").mockResolvedValue({
            message: "fallback",
            session_id: "s2",
            conversation_id: 10,
        });

        render(<ChatInterface />);
        fireEvent.change(screen.getByPlaceholderText("Ask me anything about code..."), {
            target: { value: "hi" },
        });
        fireEvent.click(screen.getByRole("button", { name: /send message/i }));

        await waitFor(() => {
            expect(sendSpy).toHaveBeenCalledTimes(1);
            expect(screen.getByText("fallback")).toBeInTheDocument();
        });
    });
});
