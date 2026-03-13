import { useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@/hooks/useProject";
import type { ProjectResource } from "@devhub/types";

/**
 * Returns a callback to manually update a resource's live status in the query cache.
 * Used when Tauri events fire with updated resource health.
 */
export function useResourceStatus(projectId: string) {
  const queryClient = useQueryClient();

  const updateLiveStatus = (
    resourceId: string,
    liveStatus: ProjectResource["liveStatus"]
  ) => {
    queryClient.setQueryData<ProjectResource[]>(
      projectKeys.resources(projectId),
      (prev) =>
        prev?.map((r) =>
          r.id === resourceId ? { ...r, liveStatus } : r
        )
    );
  };

  return { updateLiveStatus };
}
