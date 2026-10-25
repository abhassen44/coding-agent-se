import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./api";

describe("apiClient.streamMessage", () => {
    beforeEach(() => {
        localStorage.setItem("auth_token", "test-token");
    });

    it("sends auth, buffers split SSE lines, and returns conversation metadata", async () => {
        const encoder = new TextEncoder();
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode("data: hel"));
                        controller.enqueue(encoder.encode("lo\n\ndata: [DONE]\n\n"));
                        controller.close();
                    },
                }),
                {
                    status: 200,
                    headers: {
                        "x-conversation-id": "42",
                        "x-session-id": "s1",
                    },
                }
            )
        );
        vi.stubGlobal("fetch", fetchMock);

        const chunks: string[] = [];
        const onStart = vi.fn();
        const meta = await apiClient.streamMessage(
            { message: "hi" },
            (chunk) => chunks.push(chunk),
            () => undefined,
            (error) => {
                throw error;
            },
            onStart
        );

        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
        expect(chunks.join("")).toBe("hello");
        expect(onStart).toHaveBeenCalledWith({ conversationId: 42, sessionId: "s1" });
        expect(meta).toEqual({ conversationId: 42, sessionId: "s1" });
    });
});
