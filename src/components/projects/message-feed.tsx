import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentsStore } from "@/stores/agents.store";
import { MessageBubble } from "./message-bubble";
import { AgentMessage } from "@devhub/types";

interface MessageFeedProps {
  sessionId: string;
}

// Stable fallback prevents Zustand form forcing infinte re-renders
// `?? []` inside the selector creates a new array reference every call,
// which always fails Object.is equality check and loops forever
const EMPTY: AgentMessage[] = [];

export function MessageFeed({ sessionId }: MessageFeedProps) {
  const messages =
    useAgentsStore((s) => s.messagesBySession[sessionId]) ?? EMPTY;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/50">
        No messages yet — send a prompt below
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-3 p-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
