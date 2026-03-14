import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAgentSession,
  deleteAgentSession,
  updateAgentSession,
  onSidecarEvent,
} from "@/lib/tauri";
import { getDriverShim } from "@/lib/drivers";
import { projectKeys } from "@/hooks/useProject";
import { useAgentsStore } from "@/stores/agents.store";
import { logger } from "@/lib/logger";
import type {
  CreateAgentSessionInput,
  AgentSession,
  AgentStartOptions,
  McpServerConfig,
} from "@devhub/types";

// ─── Query key factories ──────────────────────────────────────────────────────

export const agentKeys = {
  sessions: (projectId: string) => ["agents", "sessions", projectId] as const,
};

// ─── SQLite session CRUD ──────────────────────────────────────────────────────

/** Mutation: create a new agent session record in SQLite */
export function useCreateAgentSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentSessionInput) => createAgentSession(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
    },
  });
}

/** Mutation: delete an agent session record from SQLite */
export function useDeleteAgentSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAgentSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
    },
  });
}

// ─── Unified driver hooks ─────────────────────────────────────────────────────

interface StartSessionArgs {
  driverId: string;
  projectRoot: string;
  mcpServers: McpServerConfig[];
  /** Initial prompt — only used by Claude which requires one at start time */
  initialPrompt?: string;
}

/**
 * Mutation: create a SQLite session record, then call the appropriate driver
 * shim's `start()` method.  Status changes and messages are surfaced via the
 * `onStatusChange` / `onMessage` callbacks passed through AgentStartOptions.
 */
export function useStartSession(
  projectId: string,
  options: Pick<AgentStartOptions, "onMessage" | "onStatusChange" | "onError">,
) {
  const queryClient = useQueryClient();
  const updateSession = useAgentsStore((s) => s.updateSession);

  return useMutation({
    mutationFn: async ({
      driverId,
      projectRoot,
      mcpServers,
    }: StartSessionArgs) => {
      const driver = getDriverShim(driverId);

      const session = await createAgentSession({
        projectId,
        agentType: driverId as "opencode" | "claude",
      });

      await driver.start({
        session,
        projectRoot,
        mcpServers,
        onMessage: options.onMessage,
        onStatusChange: (status) => {
          updateSession({ ...session, status });
          options.onStatusChange(status);
        },
        onError: options.onError,
      });

      return session;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
      logger.info("useStartSession", "Session started", { id: session.id });
    },
    onError: (err: unknown) => {
      logger.error("useStartSession", "Failed to start session", { error: String(err) });
    },
  });
}

interface ResumeSessionArgs {
  session: AgentSession;
  projectRoot: string;
  mcpServers: McpServerConfig[];
}

/**
 * Mutation: resume an existing session using its stored `externalId`.
 * Calls the driver shim's `resume()` method.
 */
export function useResumeSession(
  projectId: string,
  options: Pick<AgentStartOptions, "onMessage" | "onStatusChange" | "onError">,
) {
  const queryClient = useQueryClient();
  const updateSession = useAgentsStore((s) => s.updateSession);

  return useMutation({
    mutationFn: async ({ session, projectRoot, mcpServers }: ResumeSessionArgs) => {
      const driver = getDriverShim(session.agentType);

      await driver.resume({
        session,
        projectRoot,
        mcpServers,
        onMessage: options.onMessage,
        onStatusChange: (status) => {
          updateSession({ ...session, status });
          options.onStatusChange(status);
        },
        onError: options.onError,
      });

      return session;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
      logger.info("useResumeSession", "Session resumed", { id: session.id });
    },
    onError: (err: unknown) => {
      logger.error("useResumeSession", "Failed to resume session", { error: String(err) });
    },
  });
}

/**
 * Mutation: send a prompt to an active session via the driver shim.
 */
export function useSendMessage() {
  return useMutation({
    mutationFn: async ({ session, prompt }: { session: AgentSession; prompt: string }) => {
      const driver = getDriverShim(session.agentType);
      await driver.send(session.id, prompt);
    },
    onError: (err: unknown) => {
      logger.error("useSendMessage", "Failed to send message", { error: String(err) });
    },
  });
}

/**
 * Mutation: abort an in-progress response for a session.
 * Does not stop the session — the driver remains connected.
 */
export function useAbortSession(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: AgentSession) => {
      const driver = getDriverShim(session.agentType);
      await driver.abort(session.id);
      await updateAgentSession(session.id, { status: "idle" });
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
    },
    onError: (err: unknown) => {
      logger.error("useAbortSession", "Failed to abort session", { error: String(err) });
    },
  });
}

/**
 * Mutation: stop a session entirely and clean up driver resources.
 */
export function useStopSession(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: AgentSession) => {
      const driver = getDriverShim(session.agentType);
      await driver.stop(session.id);
      await updateAgentSession(session.id, { status: "stopped" });
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
    },
    onError: (err: unknown) => {
      logger.error("useStopSession", "Failed to stop session", { error: String(err) });
    },
  });
}

// ─── Sidecar event stream hook ────────────────────────────────────────────────

/**
 * Subscribe to all sidecar://event payloads for the lifetime of the component.
 * The callback is stable-ref'd so callers don't need to memoize it.
 */
export function useSidecarEvents(
  callback: (payload: unknown) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | null = null;

    onSidecarEvent((payload) => {
      callback(payload);
    })
      .then((fn) => { unlisten = fn; })
      .catch((err: unknown) => {
        logger.error("useSidecarEvents", "Failed to subscribe", { error: String(err) });
      });

    return () => { unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

// ─── Remote session list ──────────────────────────────────────────────────────

/**
 * Query: list sessions known to the remote agent server (OpenCode only).
 * Returns an empty array for drivers that don't implement listRemoteSessions.
 */
export function useRemoteSessions(projectId: string, driverId: string, enabled = true) {
  return useQuery({
    queryKey: ["agents", "remote-sessions", projectId, driverId],
    queryFn: async () => {
      const driver = getDriverShim(driverId);
      if (!("listRemoteSessions" in driver)) return [];
      return (driver as { listRemoteSessions: (id: string) => Promise<unknown[]> })
        .listRemoteSessions(projectId);
    },
    enabled: Boolean(projectId) && enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    retry: 0,
    throwOnError: false,
  });
}
