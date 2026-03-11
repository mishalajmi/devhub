import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createAgentSession, deleteAgentSession } from "@/lib/tauri";
import { projectKeys } from "@/hooks/useProject";
import type { CreateAgentSessionInput } from "@/types/agent";

/** Mutation hook to create a new agent session */
export function useCreateAgentSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentSessionInput) => createAgentSession(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
    },
  });
}

/** Mutation hook to delete an agent session */
export function useDeleteAgentSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAgentSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.sessions(projectId) });
    },
  });
}
