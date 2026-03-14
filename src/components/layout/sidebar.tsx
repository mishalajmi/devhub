import * as React from "react";
import { FolderOpen, Plus, Settings, Bot, Layers, GitBranch, Trash2 } from "lucide-react";
import { cn, truncatePath } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectsStore } from "@/stores/projects.store";
import type { Project } from "@devhub/types";

interface SidebarProps {
  onAddProject: () => void;
  onOpenSettings: () => void;
  onDeleteProject: (project: Project) => void;
}

export function Sidebar({ onAddProject, onOpenSettings, onDeleteProject }: SidebarProps) {
  const { projects, selectedProjectId, selectProject } = useProjectsStore();

  return (
    <aside className="flex flex-col w-52 shrink-0 border-r border-border bg-card h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground tracking-tight">DevHub</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onAddProject}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Add project</TooltipContent>
        </Tooltip>
      </div>

      {/* Projects list */}
      <div className="px-2 pt-2 pb-1">
        <p className="text-2xs font-medium text-muted-foreground uppercase tracking-widest px-1 mb-1">
          Projects
        </p>
      </div>
      <ScrollArea className="flex-1 px-2">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No projects yet</p>
            <Button variant="ghost" size="sm" onClick={onAddProject} className="text-xs h-6">
              Add one
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 pb-2">
            {projects.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isSelected={selectedProjectId === project.id}
                onSelect={() => selectProject(project.id)}
                onDelete={() => onDeleteProject(project)}
              />
            ))}
          </ul>
        )}
      </ScrollArea>

      {/* Footer actions */}
      <div className="border-t border-border p-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onOpenSettings}>
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1 text-2xs text-muted-foreground">
          <Bot className="h-3 w-3" />
          <span>{projects.length}</span>
        </div>
      </div>
    </aside>
  );
}

// ─── Project list item ────────────────────────────────────────────────────────

interface ProjectItemProps {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function ProjectItem({ project, isSelected, onSelect, onDelete }: ProjectItemProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <li>
      <div
        className={cn(
          "relative w-full rounded transition-colors group",
          isSelected ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={onSelect}
          className="w-full text-left px-2 py-1.5"
        >
          <div className="flex items-center gap-2">
            <FolderOpen
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            <div className="min-w-0 pr-5">
              <p className="text-xs font-medium truncate">{project.name}</p>
              <p className="text-2xs text-muted-foreground truncate">
                {truncatePath(project.rootPath, 2)}
              </p>
            </div>
          </div>

          {/* Indicator badges */}
          <div className="flex flex-wrap items-center gap-1 mt-1 ml-5">
            {project.gitBranch && (
              <span className="inline-flex items-center gap-0.5 text-2xs text-primary/70 truncate max-w-[100px]">
                <GitBranch className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{project.gitBranch}</span>
              </span>
            )}
            {project.hasDockerCompose && !project.gitBranch && (
              <span className="text-2xs text-muted-foreground/60">docker</span>
            )}
            {project.hasDockerCompose && project.gitBranch && (
              <span className="text-2xs text-muted-foreground/60">· docker</span>
            )}
            {project.hasEnvFile && (
              <span className="text-2xs text-muted-foreground/60">· .env</span>
            )}
          </div>
        </button>

        {/* Delete button — visible on hover */}
        {hovered && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className={cn(
                  "absolute right-1 top-1/2 -translate-y-1/2",
                  "flex items-center justify-center h-5 w-5 rounded",
                  "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                  "transition-colors"
                )}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Delete project</TooltipContent>
          </Tooltip>
        )}
      </div>
    </li>
  );
}
