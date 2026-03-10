import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/sidebar";
import { StatusBar } from "@/components/layout/status-bar";
import { ProjectTabs, TabContent, type ProjectTab } from "@/components/layout/project-tabs";
import { AddProjectDialog } from "@/components/projects/add-project-dialog";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";
import { useProjectsStore } from "@/stores/projects.store";
import { useProjects } from "@/hooks/useProject";
import { useProjectWatcher } from "@/hooks/useProjectWatcher";

import { FolderOpen, Bot } from "lucide-react";
import type { Project } from "@/types/project";

// Placeholder panels — will be replaced in later chunks
function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      {label} panel — coming soon
    </div>
  );
}

export function AppShell() {
  const { projects, selectedProjectId } = useProjectsStore();
  const [activeTab, setActiveTab] = React.useState<ProjectTab>("agents");
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [projectToDelete, setProjectToDelete] = React.useState<Project | null>(null);

  // Load projects on mount via TanStack Query — syncs to Zustand store
  useProjects();

  // Activate/deactivate the Rust file watcher when the selected project changes
  // and reactively refresh project indicators on FS events.
  useProjectWatcher();

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleAddProject = () => setAddDialogOpen(true);
  const handleOpenSettings = () => {
    // TODO: open settings dialog (Chunk 28)
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <Sidebar
          onAddProject={handleAddProject}
          onOpenSettings={handleOpenSettings}
          onDeleteProject={setProjectToDelete}
        />

        {/* Main content area */}
        <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {selectedProject ? (
            <>
              {/* Project header */}
              <header className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0">
                <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold text-foreground truncate">
                    {selectedProject.name}
                  </h1>
                  <p className="text-2xs text-muted-foreground truncate">
                    {selectedProject.rootPath}
                  </p>
                </div>
                {selectedProject.gitBranch && (
                  <span className="ml-auto text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {selectedProject.gitBranch}
                  </span>
                )}
              </header>

              {/* Tabs */}
              <div className="flex-1 overflow-hidden">
                <ProjectTabs activeTab={activeTab} onTabChange={setActiveTab}>
                  <TabContent value="agents" className="h-full">
                    <PlaceholderPanel label="Agents" />
                  </TabContent>
                  <TabContent value="resources" className="h-full">
                    <PlaceholderPanel label="Resources" />
                  </TabContent>
                  <TabContent value="mcp" className="h-full">
                    <PlaceholderPanel label="MCP Servers" />
                  </TabContent>
                  <TabContent value="skills" className="h-full">
                    <PlaceholderPanel label="Skills" />
                  </TabContent>
                  <TabContent value="code" className="h-full">
                    <PlaceholderPanel label="Code" />
                  </TabContent>
                </ProjectTabs>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Bot className="h-16 w-16 text-muted-foreground/20" />
              <div className="text-center">
                <h2 className="text-base font-medium text-foreground mb-1">No project selected</h2>
                <p className="text-sm text-muted-foreground">
                  Select a project from the sidebar or add a new one.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Status bar */}
        <StatusBar />
      </div>

      {/* Add project dialog */}
      <AddProjectDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      {/* Delete project confirmation dialog */}
      <DeleteProjectDialog
        project={projectToDelete}
        onClose={() => setProjectToDelete(null)}
      />
    </TooltipProvider>
  );
}
