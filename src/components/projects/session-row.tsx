import { Bot, Terminal, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";
import type { AgentSession } from "@devhub/types";

interface SessionRowProps {
  session: AgentSession;
  isActive: boolean;
  onSelect: () => void;
  onStop: () => void;
  onDelete: () => void;
}

export function SessionRow({
  session,
  isActive,
  onSelect,
  onStop,
  onDelete,
}: SessionRowProps) {
  const Icon = session.agentType === "opencode" ? Terminal : Bot;
  const canStop =
    session.status === "running" ||
    session.status === "idle" ||
    session.status === "initializing";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-left rounded-md text-sm transition-colors group",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate text-xs">
        {session.title ?? `${session.agentType} session`}
      </span>
      <StatusBadge status={session.status} />
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {canStop && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStop();
            }}
            className="p-0.5 rounded hover:text-foreground"
            title="Stop session"
          >
            <Square className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 rounded hover:text-red-400"
          title="Delete session"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </button>
  );
}
