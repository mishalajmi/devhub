import { FolderOpen, Plus, Settings, Bot, Layers } from "lucide-react";
import { cn, truncatePath } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectsStore } from "@/stores/projects.store";

interface SidebarProps {
  onAddProject: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ onAddProject, onOpenSettings }: SidebarProps) {
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
              <li key={project.id}>
                <button
                  onClick={() => selectProject(project.id)}
                  className={cn(
                    "w-full text-left rounded px-2 py-1.5 transition-colors group",
                    selectedProjectId === project.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        selectedProjectId === project.id
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{project.name}</p>
                      <p className="text-2xs text-muted-foreground truncate">
                        {truncatePath(project.rootPath, 2)}
                      </p>
                    </div>
                  </div>
                  {/* Project indicators */}
                  <div className="flex items-center gap-1 mt-1 ml-5">
                    {project.hasGit && (
                      <span className="text-2xs text-muted-foreground/60">git</span>
                    )}
                    {project.hasDockerCompose && (
                      <span className="text-2xs text-muted-foreground/60">docker</span>
                    )}
                    {project.gitBranch && (
                      <span className="text-2xs text-muted-foreground/60 truncate">
                        {project.gitBranch}
                      </span>
                    )}
                  </div>
                </button>
              </li>
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
