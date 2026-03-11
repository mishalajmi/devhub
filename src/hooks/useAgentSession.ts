import * as React from "react";
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
import { projectKeys } from "@/hooks/useProject";
import { useAgentsStore } from "@/stores/agents.store";
import { logger } from "@/lib/logger";
import type { CreateAgentSessionInput, OpenCodeInstance, OpenCodeSession } from "@/types/agent";

// ─── Query key factories ──────────────────────────────────────────────────────

export const agentKeys = {
  instances: (projectId: string) => ["agents", "instances", projectId] as const,
  opencodeSessions: (projectId: string, baseUrl: string) =>
    ["agents", "opencode-sessions", projectId, baseUrl] as const,
};

// ─── Legacy hooks (SQLite-backed, used by current AgentsPane) ─────────────────

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
 * Runs once on mount and stores results in Zustand.
 * Returns the TanStack Query result so callers can read isLoading / error.
 */
export function useOpenCodeInstances(projectId: string) {
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
    enabled: Boolean(projectId),
    // Refresh discovery every 30 s so the UI reflects instances that come/go
    refetchInterval: 30_000,
    // Don't re-run on window focus — discovery is expensive (100 port probes)
    refetchOnWindowFocus: false,
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
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
  });
}

// ─── OpenCode session creation ────────────────────────────────────────────────

interface CreateOpenCodeSessionVars {
  baseUrl: string;
  title?: string;
}

/**
 * Creates a session on an OpenCode server and persists it to SQLite.
 * Invalidates both the OpenCode sessions query and the SQLite sessions query.
 */
export function useCreateOpenCodeSession(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ baseUrl, title }: CreateOpenCodeSessionVars) => {
      // 1. Create on OpenCode server
      const ocSession = await createSession(baseUrl, projectId, title);

      // 2. Persist to SQLite so we can resume it across app restarts
      const dbSession = await createAgentSession({
        projectId,
        agentType: "opencode",
        title: ocSession.title ?? title,
      });

      // 3. Link the SQLite record to the OpenCode session ID
      await updateAgentSession(dbSession.id, { externalId: ocSession.id });

      return { ocSession, dbSession };
    },
    onSuccess: ({ ocSession, dbSession }) => {
      // Invalidate SQLite sessions
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
      // Invalidate OpenCode server session lists for all known instances
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
      await deleteSession(baseUrl, ocSessionId).catch(() => {
        // Server may not support DELETE — ignore 404 / method not allowed
      });
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

// ─── SSE event stream ─────────────────────────────────────────────────────────

/**
 * Subscribes to the OpenCode SSE event stream for a session.
 * Cleans up the EventSource on unmount or when dependencies change.
 */
export function useOpenCodeEventStream(
  baseUrl: string | null,
  sessionId: string | null,
  onEvent: Parameters<typeof subscribeToEvents>[2]
) {
  // Stable ref so the effect doesn't re-run when the callback identity changes
  const onEventRef = React.useRef(onEvent);

  // Keep the ref in sync with the latest callback via a separate effect
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
