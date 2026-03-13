import * as React from "react";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAgentSession, deleteAgentSession, updateAgentSession } from "@/lib/tauri";
import {
  discoverInstances,
  createSession,
  listSessions,
  abortSession,
  subscribeToEvents,
  deleteSession,
} from "@/lib/opencode";
import {
  createClaudeSession,
  resumeClaudeSession,
  abortClaudeSession,
  onClaudeEvent,
} from "@/lib/claude";
import { projectKeys } from "@/hooks/useProject";
import { useAgentsStore } from "@/stores/agents.store";
import { logger } from "@/lib/logger";
import type {
  CreateAgentSessionInput,
  AgentSession,
  OpenCodeInstance,
  OpenCodeSession,
  ClaudeEvent,
  ClaudeMessage,
  McpServerConfig,
} from "@devhub/types";

// ─── Query key factories ──────────────────────────────────────────────────────

export const agentKeys = {
  instances: (projectId: string) => ["agents", "instances", projectId] as const,
  opencodeSessions: (projectId: string, baseUrl: string) =>
    ["agents", "opencode-sessions", projectId, baseUrl] as const,
};

// ─── Legacy hooks (SQLite-backed) ─────────────────────────────────────────────

/** Mutation hook to create a new agent session in SQLite */
export function useCreateAgentSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentSessionInput) => createAgentSession(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
    },
  });
}

/** Mutation hook to delete an agent session from SQLite */
export function useDeleteAgentSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAgentSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
    },
  });
}

// ─── OpenCode discovery ───────────────────────────────────────────────────────

/**
 * Discovers OpenCode instances on the well-known port range.
 * Only runs when `enabled` is true (i.e. the Agents tab is visible).
 * Stores results in Zustand and returns the TanStack Query result.
 */
export function useOpenCodeInstances(projectId: string, enabled = true) {
  const setInstances = useAgentsStore((s) => s.setInstances);

  return useQuery<OpenCodeInstance[]>({
    queryKey: agentKeys.instances(projectId),
    queryFn: async () => {
      const instances = await discoverInstances();
      setInstances(projectId, instances);
      logger.info("useOpenCodeInstances", "Discovered instances", {
        projectId,
        count: instances.length,
      });
      return instances;
    },
    enabled: Boolean(projectId) && enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
    throwOnError: false,
  });
}

// ─── OpenCode session list ────────────────────────────────────────────────────

/**
 * Lists sessions from an OpenCode server instance.
 * Only runs when a baseUrl is provided (i.e. an instance was discovered).
 */
export function useOpenCodeSessions(projectId: string, baseUrl: string | null) {
  return useQuery<OpenCodeSession[]>({
    queryKey: agentKeys.opencodeSessions(projectId, baseUrl ?? ""),
    queryFn: () => listSessions(baseUrl!),
    enabled: Boolean(projectId) && Boolean(baseUrl),
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry: 0,
    throwOnError: false,
  });
}

// ─── OpenCode session creation ────────────────────────────────────────────────

interface CreateOpenCodeSessionVars {
  baseUrl: string;
  title?: string;
}

/**
 * Creates a session on an OpenCode server and persists it to SQLite.
 */
export function useCreateOpenCodeSession(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ baseUrl, title }: CreateOpenCodeSessionVars) => {
      const ocSession = await createSession(baseUrl, projectId, title);
      const dbSession = await createAgentSession({
        projectId,
        agentType: "opencode",
        title: ocSession.title ?? title,
      });
      await updateAgentSession(dbSession.id, { externalId: ocSession.id });
      return { ocSession, dbSession };
    },
    onSuccess: ({ ocSession, dbSession }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
      queryClient.invalidateQueries({ queryKey: ["agents", "opencode-sessions", projectId] });
      logger.info("useCreateOpenCodeSession", "Session created", {
        projectId,
        dbId: dbSession.id,
        ocId: ocSession.id,
      });
    },
    onError: (err: unknown) => {
      logger.error("useCreateOpenCodeSession", "Failed to create session", {
        error: String(err),
      });
    },
  });
}

// ─── OpenCode session deletion ────────────────────────────────────────────────

interface DeleteOpenCodeSessionVars {
  dbId: string;
  baseUrl: string;
  ocSessionId: string;
}

/**
 * Deletes an OpenCode session from the server and from SQLite.
 */
export function useDeleteOpenCodeSession(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dbId, baseUrl, ocSessionId }: DeleteOpenCodeSessionVars) => {
      await abortSession(baseUrl, ocSessionId);
      await deleteSession(baseUrl, ocSessionId).catch(() => {});
      await deleteAgentSession(dbId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
      queryClient.invalidateQueries({ queryKey: ["agents", "opencode-sessions", projectId] });
    },
    onError: (err: unknown) => {
      logger.error("useDeleteOpenCodeSession", "Failed to delete session", {
        error: String(err),
      });
    },
  });
}

// ─── OpenCode SSE event stream ────────────────────────────────────────────────

/**
 * Subscribes to the OpenCode SSE event stream for a session.
 * Cleans up the EventSource on unmount or when dependencies change.
 */
export function useOpenCodeEventStream(
  baseUrl: string | null,
  sessionId: string | null,
  onEvent: Parameters<typeof subscribeToEvents>[2]
) {
  const onEventRef = React.useRef(onEvent);

  React.useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    if (!baseUrl || !sessionId) return;
    const unsubscribe = subscribeToEvents(baseUrl, sessionId, (event) => {
      onEventRef.current(event);
    });
    return unsubscribe;
  }, [baseUrl, sessionId]);
}

// ─── Claude session creation ──────────────────────────────────────────────────

interface CreateClaudeSessionArgs {
  prompt: string;
  mcpServers?: McpServerConfig[];
}

/**
 * Mutation: create an agent session record in SQLite, start the Claude session
 * via the sidecar, and listen for `claude:session:init` to persist the
 * Claude-native session ID (`externalId`) back to SQLite.
 */
export function useCreateClaudeSession(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ prompt, mcpServers = [] }: CreateClaudeSessionArgs) => {
      const session = await createAgentSession({
        projectId,
        agentType: "claude",
      });

      await updateAgentSession(session.id, { status: "running" });

      const unlisten = await onClaudeEvent(async (event: ClaudeEvent) => {
        if (
          event.type === "claude:session:init" &&
          event.sessionId === session.id &&
          event.claudeSessionId
        ) {
          try {
            await updateAgentSession(session.id, {
              externalId: event.claudeSessionId,
              status: "running",
            });
            queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
            logger.info("useCreateClaudeSession", "claude:session:init received", {
              sessionId: session.id,
              claudeSessionId: event.claudeSessionId,
            });
          } catch (err) {
            logger.error("useCreateClaudeSession", "Failed to persist claudeSessionId", {
              error: String(err),
            });
          } finally {
            unlisten();
          }
        }
      });

      await createClaudeSession(session.id, prompt, mcpServers);

      return { ...session, status: "running" } as AgentSession;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
      logger.info("useCreateClaudeSession", "Claude session created", { id: session.id });
    },
    onError: (err: unknown) => {
      logger.error("useCreateClaudeSession", "Failed to create Claude session", {
        error: String(err),
      });
    },
  });
}

// ─── Claude event stream ──────────────────────────────────────────────────────

/**
 * Subscribe to the sidecar event stream for a specific DevHub session.
 * Calls `onMessage` for every `claude:message` event matching the sessionId.
 * Automatically unsubscribes on unmount.
 */
export function useClaudeEventStream(
  sessionId: string | null,
  onMessage: (message: ClaudeMessage) => void
): void {
  useEffect(() => {
    if (!sessionId) return;

    let unlisten: (() => void) | null = null;

    onClaudeEvent((event: ClaudeEvent) => {
      if (event.sessionId !== sessionId) return;
      if (event.type === "claude:message" && event.message) {
        onMessage(event.message);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        logger.error("useClaudeEventStream", "Failed to subscribe to claude events", {
          error: String(err),
          sessionId,
        });
      });

    return () => {
      unlisten?.();
    };
  }, [sessionId, onMessage]);
}

// ─── Claude session resume ────────────────────────────────────────────────────

interface ResumeClaudeSessionArgs {
  session: AgentSession;
  prompt: string;
}

/**
 * Mutation: resume an existing Claude session using its stored `externalId`.
 */
export function useResumeClaudeSession(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ session, prompt }: ResumeClaudeSessionArgs) => {
      if (!session.externalId) {
        throw new Error(
          `Session ${session.id} has no externalId — cannot resume without a Claude session ID`
        );
      }
      await updateAgentSession(session.id, { status: "running" });
      await resumeClaudeSession(session.id, session.externalId, prompt);
      return session;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
      logger.info("useResumeClaudeSession", "Claude session resumed", { id: session.id });
    },
    onError: (err: unknown) => {
      logger.error("useResumeClaudeSession", "Failed to resume Claude session", {
        error: String(err),
      });
    },
  });
}

// ─── Claude session abort ─────────────────────────────────────────────────────

/**
 * Mutation: abort a running Claude session and mark it as stopped in SQLite.
 */
export function useAbortClaudeSession(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: AgentSession) => {
      await abortClaudeSession(session.id);
      await updateAgentSession(session.id, { status: "stopped" });
      return session;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
      logger.info("useAbortClaudeSession", "Claude session aborted", { id: session.id });
    },
    onError: (err: unknown) => {
      logger.error("useAbortClaudeSession", "Failed to abort Claude session", {
        error: String(err),
      });
    },
  });
}
