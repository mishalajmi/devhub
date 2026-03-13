import * as React from "react";
import {
  Database,
  Server,
  Cloud,
  Container,
  KeyRound,
  Plus,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useResourcesQuery } from "@/hooks/useProject";
import { AddResourceDialog } from "./add-resource-dialog";
import { DeleteResourceDialog } from "./delete-resource-dialog";
import type { ProjectResource, ResourceType } from "@devhub/types";

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

interface ResourceRowProps {
  resource: ProjectResource;
  onEdit: (resource: ProjectResource) => void;
  onDelete: (resource: ProjectResource) => void;
}

function ResourceRow({ resource, onEdit, onDelete }: ResourceRowProps) {
  const healthy = resource.liveStatus?.healthy;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded border border-border bg-card",
        "hover:border-border/80 transition-colors group"
      )}
    >
      {renderResourceIcon(resource.resourceType)}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{resource.name}</p>
        <p className="text-2xs text-muted-foreground">{resourceLabel(resource.resourceType)}</p>
      </div>
      {resource.liveStatus && (
        <Badge variant={healthy ? "running" : "error"}>
          {healthy ? "healthy" : "unhealthy"}
        </Badge>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(resource)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Edit resource"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(resource)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete resource"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ResourcesPane({ projectId }: ResourcesPaneProps) {
  const { data: resources, isLoading, error } = useResourcesQuery(projectId);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ProjectResource | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectResource | null>(null);

  const handleEdit = (resource: ProjectResource) => {
    setEditTarget(resource);
    setAddOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setAddOpen(open);
    if (!open) setEditTarget(undefined);
  };

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
          onClick={() => setAddOpen(true)}
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
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setAddOpen(true)}
                >
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
              onEdit={handleEdit}
              onDelete={(r) => setDeleteTarget(r)}
            />
          ))}
        </div>
      </ScrollArea>

      <AddResourceDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={handleDialogClose}
        editTarget={editTarget}
      />

      <DeleteResourceDialog
        projectId={projectId}
        resource={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
