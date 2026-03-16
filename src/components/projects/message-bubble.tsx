import { cn } from "@/lib/utils";
import type { AgentMessage } from "@devhub/types";

interface MessageBubbleProps {
  msg: AgentMessage;
}

export function MessageBubble({ msg }: MessageBubbleProps) {
  if (msg.kind === "text") {
    return (
      <div
        className={cn(
          "flex gap-2 text-sm",
          msg.role === "user" && "flex-row-reverse",
        )}
      >
        <div
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap wrap-break-words",
            msg.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.kind === "tool_use") {
    return (
      <div className="text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 border border-border/50">
        <span className="text-blue-400">⚙ tool:</span> {msg.toolName}
      </div>
    );
  }

  if (msg.kind === "tool_result") {
    return (
      <div
        className={cn(
          "text-xs font-mono rounded px-2 py-1 border",
          msg.isError
            ? "text-red-400 bg-red-500/10 border-red-500/20"
            : "text-muted-foreground bg-muted/40 border-border/50",
        )}
      >
        <span className={msg.isError ? "text-red-400" : "text-green-400"}>
          {msg.isError ? "✗ error:" : "✓ result:"}
        </span>{" "}
        {msg.toolName}
      </div>
    );
  }

  if (msg.kind === "system") {
    if (msg.event === "done" || msg.event === "heartbeat") return null;
    return (
      <div className="text-xs text-muted-foreground/60 text-center font-mono">
        {msg.event === "error" ? `⚠ ${msg.detail ?? "error"}` : msg.event}
      </div>
    );
  }

  return null;
}
