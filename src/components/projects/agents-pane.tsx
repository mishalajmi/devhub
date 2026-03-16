import { useCallback } from "react";
import { Bot, Terminal, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentsStore } from "@/stores/agents.store";
import { useAgentSessionsQuery } from "@/hooks/useProject";
import {
  useStartSession,
  useStopSession,
  useDeleteAgentSession,
  useSendMessage,
  useAbortSession,
} from "@/hooks/useAgentSession";
import { StatusBadge } from "./status-badge";
import { SessionRow } from "./session-row";
import { MessageFeed } from "./message-feed";
import { PromptInput } from "./prompt-input";
import type { AgentMessage, AgentSessionStatus } from "@devhub/types";

interface AgentsPaneProps {
  projectId: string;
  projectRoot: string;
}

export function AgentsPane({ projectId, projectRoot }: AgentsPaneProps) {
  const { data: sessions = [] } = useAgentSessionsQuery(projectId);

  const activeSessionId = useAgentsStore((s) => s.activeSessionId);
  const setActiveSession = useAgentsStore((s) => s.setActiveSession);
  const addMessage = useAgentsStore((s) => s.addMessage);
  const updateSession = useAgentsStore((s) => s.updateSession);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // Read session state imperatively inside callbacks to avoid closing over
  // activeSession and triggering an infinite update loop.
  const onMessage = useCallback(
    (msg: AgentMessage) => addMessage(msg.sessionId, msg),
    [addMessage],
  );

  const onStatusChange = useCallback(
    (status: AgentSessionStatus) => {
      const { activeSessionId: id, sessionsByProject } = useAgentsStore.getState();
      if (!id) return;
      const session = Object.values(sessionsByProject).flat().find((s) => s.id === id);
      if (session) updateSession({ ...session, status });
    },
    [updateSession],
  );

  const onError = useCallback(
    (err: Error) => {
      const { activeSessionId: id } = useAgentsStore.getState();
      if (!id) return;
      addMessage(id, {
        kind: "system",
        id: crypto.randomUUID(),
        sessionId: id,
        event: "error",
        detail: err.message,
        timestamp: new Date().toISOString(),
      });
    },
    [addMessage],
  );

  const startSession = useStartSession(projectId, { onMessage, onStatusChange, onError });
  const stopSession = useStopSession(projectId);
  const deleteSession = useDeleteAgentSession(projectId);
  const sendMessage = useSendMessage();
  const abortSession = useAbortSession(projectId);

  function handleNewSession(driverId: "opencode" | "claude") {
    startSession.mutate({ driverId, projectRoot, mcpServers: [] });
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left sidebar ── */}
      <div className="w-56 shrink-0 border-r border-border flex flex-col">

        {/* New session buttons */}
        <div className="p-2 border-b border-border flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-xs justify-start gap-1.5"
            onClick={() => handleNewSession("opencode")}
            disabled={startSession.isPending}
          >
            <Terminal className="h-3.5 w-3.5" />
            OpenCode
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-xs justify-start gap-1.5"
            onClick={() => handleNewSession("claude")}
            disabled={startSession.isPending}
          >
            <Bot className="h-3.5 w-3.5" />
            Claude
          </Button>
        </div>

        {/* Session list */}
        <ScrollArea className="flex-1">
          <div className="p-1 flex flex-col gap-0.5">
            {sessions.length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-6 px-2">
                No sessions yet.<br />Start one above.
              </p>
            )}
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={() => setActiveSession(session.id)}
                onStop={() => stopSession.mutate(session)}
                onDelete={() => {
                  deleteSession.mutate(session.id);
                  if (activeSessionId === session.id) setActiveSession(null);
                }}
              />
            ))}
          </div>
        </ScrollArea>

        {startSession.isPending && (
          <div className="p-2 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Starting session…
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      {activeSession ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
            {activeSession.agentType === "opencode"
              ? <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              : <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            }
            <span className="text-sm font-medium flex-1 truncate">
              {activeSession.title ?? `${activeSession.agentType} session`}
            </span>
            <StatusBadge status={activeSession.status} />
          </div>

          {/* Messages */}
          <MessageFeed sessionId={activeSession.id} />

          {/* Input */}
          <PromptInput
            session={activeSession}
            onSend={(prompt) => sendMessage.mutate({ session: activeSession, prompt })}
            onAbort={() => abortSession.mutate(activeSession)}
            isSending={sendMessage.isPending}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <Plus className="h-8 w-8 text-muted-foreground/20" />
          <div>
            <p className="text-sm font-medium text-foreground mb-1">
              No session selected
            </p>
            <p className="text-xs text-muted-foreground">
              Start a new OpenCode or Claude session using the buttons on the left.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
