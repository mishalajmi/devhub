import { useState } from "react";
import { Send, StopCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentSession } from "@devhub/types";

interface PromptInputProps {
  session: AgentSession;
  onSend: (prompt: string) => void;
  onAbort: () => void;
  isSending: boolean;
}

export function PromptInput({
  session,
  onSend,
  onAbort,
  isSending,
}: PromptInputProps) {
  const [value, setValue] = useState("");

  const isRunning =
    session.status === "running" || session.status === "initializing";
  const canSend =
    value.trim().length > 0 && !isRunning && session.status !== "stopped";

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-border p-3 flex gap-2 items-end">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          isRunning
            ? "Waiting for response…"
            : "Send a message… (Enter to send, Shift+Enter for newline)"
        }
        disabled={isRunning || session.status === "stopped"}
        rows={2}
        className="flex-1 resize-none bg-muted/30 border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
      {isRunning ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onAbort}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
          title="Abort"
        >
          <StopCircle className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={submit}
          disabled={!canSend || isSending}
          className="shrink-0"
          title="Send"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}
