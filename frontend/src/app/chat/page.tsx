import { Suspense } from "react";
import { ChatInterface } from "@/components/chat";

export default function ChatPage() {
    return (
        <div className="h-[calc(100vh-3.5rem)]">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-[#5A7268]">Loading chat...</div>}>
                <ChatInterface />
            </Suspense>
        </div>
    );
}
