import { Bot, Plus, Loader2, Trash2, Wifi, WifiOff, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAgentSessionsQuery } from "@/hooks/useProject";
import {
  useOpenCodeInstances,
  useOpenCodeSessions,
  useCreateOpenCodeSession,
  useDeleteOpenCodeSession,
  useOpenCodeEventStream,
} from "@/hooks/useAgentSession";
import { useAgentsStore } from "@/stores/agents.store";
import { deleteAgentSession } from "@/lib/tauri";
import { timeAgo } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { AgentSession, OpenCodeInstance, OpenCodeSession } from "@/types/agent";

interface AgentsPaneProps {
  projectId: string;
  isActive?: boolean;
}

// ─── Instance header ──────────────────────────────────────────────────────────

interface InstanceBannerProps {
  instance: OpenCodeInstance;
}

function InstanceBanner({ instance }: InstanceBannerProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-status-running/10 border-b border-border shrink-0">
      <Wifi className="h-3.5 w-3.5 text-status-running shrink-0" />
      <span className="text-xs text-status-running font-medium">Connected</span>
      <span className="text-2xs text-muted-foreground">:{instance.port}</span>
      <Badge variant="secondary" className="ml-auto text-2xs">
        v{instance.version}
      </Badge>
    </div>
  );
}

// ─── Empty state when no OpenCode is running ──────────────────────────────────

function NoInstanceEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 gap-3 px-6">
      <WifiOff className="h-10 w-10 text-muted-foreground/20" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground mb-1">No OpenCode instance found</p>
        <p className="text-xs text-muted-foreground mb-2">
          Start an OpenCode server to create and manage agent sessions.
        </p>
        <code className="text-2xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground">
          opencode serve
        </code>
      </div>
    </div>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────

interface OpenCodeSessionRowProps {
  ocSession: OpenCodeSession;
  dbSession: AgentSession | undefined;
  isActive: boolean;
  isAborting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function statusVariant(s: string): "running" | "stopped" | "error" | "secondary" {
  if (s === "running") return "running";
  if (s === "error") return "error";
  if (s === "stopped") return "stopped";
  return "secondary";
}

function OpenCodeSessionRow({
  ocSession,
  dbSession,
  isActive,
  isAborting,
  onSelect,
  onDelete,
}: OpenCodeSessionRowProps) {
  const status = dbSession?.status ?? "idle";
  const title = ocSession.title ?? dbSession?.title ?? ocSession.id.slice(0, 8);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded border text-left transition-colors group",
        isActive
          ? "border-primary/60 bg-primary/5"
          : "border-border bg-card hover:border-border/80"
      )}
    >
      <Bot className="h-4 w-4 shrink-0 text-agent-opencode" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{title}</p>
        <p className="text-2xs text-muted-foreground">
          {timeAgo(ocSession.createdAt ?? dbSession?.createdAt ?? new Date().toISOString())}
        </p>
      </div>
      <Badge variant={statusVariant(status)}>{status}</Badge>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isAborting}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive disabled:opacity-50"
        aria-label="Delete session"
      >
        {isAborting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </button>
  );
}

// ─── SQLite-only session row (fallback when no instance) ─────────────────────

interface DbSessionRowProps {
  session: AgentSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function DbSessionRow({ session, isActive, onSelect, onDelete }: DbSessionRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded border text-left transition-colors group",
        isActive
          ? "border-primary/60 bg-primary/5"
          : "border-border bg-card hover:border-border/80"
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
        <p className="text-2xs text-muted-foreground">{timeAgo(session.updatedAt)}</p>
      </div>
      <Badge variant={statusVariant(session.status)}>{session.status}</Badge>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        aria-label="Delete session"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </button>
  );
}

// ─── Active session event stream subscription ─────────────────────────────────

interface EventStreamWatcherProps {
  baseUrl: string;
  sessionId: string;
  projectId: string;
}

function EventStreamWatcher({ baseUrl, sessionId, projectId }: EventStreamWatcherProps) {
  const updateSession = useAgentsStore((s) => s.updateSession);
  const sessions = useAgentsStore((s) => s.sessionsByProject[projectId] ?? []);

  useOpenCodeEventStream(baseUrl, sessionId, (event) => {
    const session = sessions.find((s) => s.externalId === sessionId);
    if (!session) return;

    if (event.type === "assistant.message.start") {
      updateSession({ ...session, status: "running" });
    } else if (event.type === "assistant.message.stop" || event.type === "session.idle") {
      updateSession({ ...session, status: "idle" });
    } else if (event.type === "session.error") {
      updateSession({ ...session, status: "error" });
    }
  });

  return null;
}

// ─── Main pane ────────────────────────────────────────────────────────────────

// Local type mirroring the vars shape from useDeleteOpenCodeSession
interface DeleteOpenCodeSessionVars {
  dbId: string;
  baseUrl: string;
  ocSessionId: string;
}

export function AgentsPane({ projectId, isActive = false }: AgentsPaneProps) {
  const { data: instances, isLoading: isDiscovering, refetch: rediscover } =
    useOpenCodeInstances(projectId, isActive);

  const activeInstance: OpenCodeInstance | null = instances?.[0] ?? null;

  const { data: ocSessions, isLoading: isLoadingOcSessions } = useOpenCodeSessions(
    projectId,
    activeInstance?.baseUrl ?? null
  );

  const { data: dbSessions, isLoading: isLoadingDb } = useAgentSessionsQuery(projectId);

  const createMutation = useCreateOpenCodeSession(projectId);
  const deleteMutation = useDeleteOpenCodeSession(projectId);

  const activeSessionId = useAgentsStore((s) => s.activeSessionId);
  const setActiveSession = useAgentsStore((s) => s.setActiveSession);

  const isLoading = isDiscovering || isLoadingOcSessions || isLoadingDb;

  const handleNewSession = () => {
    if (!activeInstance) return;
    createMutation.mutate({ baseUrl: activeInstance.baseUrl });
  };

  const handleDeleteSession = (
    ocSession: OpenCodeSession,
    dbSession: AgentSession | undefined
  ) => {
    if (!activeInstance || !dbSession) return;
    deleteMutation.mutate({
      dbId: dbSession.id,
      baseUrl: activeInstance.baseUrl,
      ocSessionId: ocSession.id,
    });
  };

  const handleDeleteDbSession = (dbId: string) => {
    deleteAgentSession(dbId).catch((err: unknown) => {
      logger.error("AgentsPane", "Failed to delete db session", { error: String(err) });
    });
  };

  // Active OpenCode session for event stream
  const activeDbSession = dbSessions?.find((s) => s.id === activeSessionId);
  const activeOcSessionId = activeDbSession?.externalId ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* SSE stream watcher — mounts only when there's an active session */}
      {activeInstance && activeOcSessionId && (
        <EventStreamWatcher
          baseUrl={activeInstance.baseUrl}
          sessionId={activeOcSessionId}
          projectId={projectId}
        />
      )}

      {/* Pane header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Agent Sessions
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => rediscover()}
            disabled={isDiscovering}
            className="h-6 w-6 p-0"
            title="Re-scan for OpenCode instances"
          >
            <RefreshCw className={cn("h-3 w-3", isDiscovering && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewSession}
            disabled={!activeInstance || createMutation.isPending}
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
      </div>

      {/* Instance connection banner */}
      {activeInstance && <InstanceBanner instance={activeInstance} />}

      <ScrollArea className="flex-1">
        <div className="p-3 flex flex-col gap-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && !activeInstance && <NoInstanceEmptyState />}

          {/* OpenCode server sessions (live data) */}
          {!isLoading && activeInstance && ocSessions && ocSessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Bot className="h-10 w-10 text-muted-foreground/20" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground mb-1">No sessions yet</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Create a session to start interacting with OpenCode.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewSession}
                  disabled={createMutation.isPending}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3" />
                  New session
                </Button>
              </div>
            </div>
          )}

          {activeInstance &&
            ocSessions?.map((ocSession) => {
              const dbSession = dbSessions?.find((s) => s.externalId === ocSession.id);
              const isActive = !!(dbSession && dbSession.id === activeSessionId);
              const isDeleting =
                deleteMutation.isPending &&
                (deleteMutation.variables as DeleteOpenCodeSessionVars | undefined)
                  ?.ocSessionId === ocSession.id;

              return (
                <OpenCodeSessionRow
                  key={ocSession.id}
                  ocSession={ocSession}
                  dbSession={dbSession}
                  isActive={isActive}
                  isAborting={isDeleting}
                  onSelect={() => setActiveSession(dbSession?.id ?? null)}
                  onDelete={() => handleDeleteSession(ocSession, dbSession)}
                />
              );
            })}

          {/* Orphaned SQLite sessions when no instance is running */}
          {!activeInstance &&
            !isLoading &&
            dbSessions
              ?.filter((s) => s.agentType === "opencode")
              .map((session) => (
                <DbSessionRow
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onSelect={() => setActiveSession(session.id)}
                  onDelete={() => handleDeleteDbSession(session.id)}
                />
              ))}

          {/* Abort error indicator */}
          {deleteMutation.isError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-destructive/30 bg-destructive/10">
              <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <p className="text-xs text-destructive">Failed to delete session</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
