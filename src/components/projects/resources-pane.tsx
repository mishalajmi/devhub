import {
  Database,
  Server,
  Cloud,
  Container,
  KeyRound,
  Plus,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useResourcesQuery } from "@/hooks/useProject";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteResource } from "@/lib/tauri";
import { projectKeys } from "@/hooks/useProject";
import type { ProjectResource, ResourceType } from "@/types/resource";

interface ResourcesPaneProps {
  projectId: string;
}

function resourceLabel(type: ResourceType): string {
  switch (type) {
    case "docker":
      return "Docker";
    case "service":
      return "Service";
    case "database":
      return "Database";
    case "cloud":
      return "Cloud";
    case "env":
      return "Env / Secrets";
  }
}

interface ResourceRowProps {
  resource: ProjectResource;
  onDelete: (id: string) => void;
}

function renderResourceIcon(type: ResourceType) {
  const props = { className: "h-4 w-4 shrink-0 text-muted-foreground" };
  switch (type) {
    case "docker":
      return <Container {...props} />;
    case "service":
      return <Server {...props} />;
    case "database":
      return <Database {...props} />;
    case "cloud":
      return <Cloud {...props} />;
    case "env":
      return <KeyRound {...props} />;
  }
}

function ResourceRow({ resource, onDelete }: ResourceRowProps) {
  const healthy = resource.liveStatus?.healthy;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded border border-border bg-card",
        "hover:border-border/80 transition-colors group"
      )}
    >
      {renderResourceIcon(resource.type)}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{resource.name}</p>
        <p className="text-2xs text-muted-foreground">{resourceLabel(resource.type)}</p>
      </div>
      {resource.liveStatus && (
        <Badge variant={healthy ? "running" : "error"}>
          {healthy ? "healthy" : "unhealthy"}
        </Badge>
      )}
      <button
        onClick={() => onDelete(resource.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        aria-label="Delete resource"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ResourcesPane({ projectId }: ResourcesPaneProps) {
  const { data: resources, isLoading, error } = useResourcesQuery(projectId);
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteResource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.resources(projectId) });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Resources
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          disabled
        >
          <Plus className="h-3 w-3" />
          Add resource
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
            <p className="text-xs text-destructive px-1">Failed to load resources</p>
          )}

          {!isLoading && !error && resources?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Database className="h-10 w-10 text-muted-foreground/20" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground mb-1">
                  No resources configured
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Add Docker containers, services, databases, cloud configs, or env files.
                </p>
                <Button variant="outline" size="sm" className="text-xs" disabled>
                  <Plus className="h-3 w-3" />
                  Add resource
                </Button>
              </div>
            </div>
          )}

          {resources?.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
