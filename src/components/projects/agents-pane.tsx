import { Bot, Plus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAgentSessionsQuery } from "@/hooks/useProject";
import { useCreateAgentSession, useDeleteAgentSession } from "@/hooks/useAgentSession";
import { timeAgo } from "@/lib/utils";
import type { AgentSession, AgentSessionStatus } from "@/types/agent";

interface AgentsPaneProps {
  projectId: string;
}

function statusVariant(
  status: AgentSessionStatus
): "running" | "stopped" | "error" | "secondary" {
  switch (status) {
    case "running":
      return "running";
    case "error":
      return "error";
    case "stopped":
      return "stopped";
    default:
      return "secondary";
  }
}

interface SessionRowProps {
  session: AgentSession;
  onDelete: (id: string) => void;
}

function SessionRow({ session, onDelete }: SessionRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded border border-border bg-card",
        "hover:border-border/80 transition-colors group"
      )}
    >
      <Bot
        className={cn(
          "h-4 w-4 shrink-0",
          session.agentType === "opencode" ? "text-agent-opencode" : "text-agent-claude"
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {session.title ?? `${session.agentType} session`}
        </p>
        <p className="text-2xs text-muted-foreground">
          {timeAgo(session.updatedAt)}
        </p>
      </div>
      <Badge variant={statusVariant(session.status)}>{session.status}</Badge>
      <button
        onClick={() => onDelete(session.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        aria-label="Delete session"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function AgentsPane({ projectId }: AgentsPaneProps) {
  const { data: sessions, isLoading, error } = useAgentSessionsQuery(projectId);
  const createMutation = useCreateAgentSession(projectId);
  const deleteMutation = useDeleteAgentSession(projectId);

  const handleAdd = () => {
    createMutation.mutate({
      projectId,
      agentType: "opencode",
      title: undefined,
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Pane header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Agent Sessions
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAdd}
          disabled={createMutation.isPending}
          className="h-6 text-xs gap-1"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          New session
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 flex flex-col gap-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive px-1">
              Failed to load sessions
            </p>
          )}

          {!isLoading && !error && sessions?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Bot className="h-10 w-10 text-muted-foreground/20" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground mb-1">
                  No agent sessions yet
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Start a session to interact with OpenCode or Claude.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAdd}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3" />
                  Add session
                </Button>
              </div>
            </div>
          )}

          {sessions?.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
