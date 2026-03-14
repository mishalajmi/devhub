/**
 * Add-project dialog.
 *
 * Flow:
 *  1. User clicks "Add project" → dialog opens
 *  2. User clicks "Browse…" → native folder picker opens
 *  3. On folder selection the backend scans the path (git, docker-compose, .env)
 *  4. Name defaults to the folder basename; user can change it
 *  5. Submit calls createProject; duplicate-path errors are shown inline
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FolderOpen, GitBranch, Container, FileKey, X, Loader2 } from "lucide-react";
import { cn, folderName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCreateProject } from "@/hooks/useProject";
import { pickAndScanFolder } from "@/hooks/useProject";
import { logger } from "@/lib/logger";
import type { FolderScanResult } from "@devhub/types";

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PickedFolder {
  path: string;
  scan: FolderScanResult;
}

export function AddProjectDialog({ open, onOpenChange }: AddProjectDialogProps) {
  const [picked, setPicked] = React.useState<PickedFolder | null>(null);
  const [name, setName] = React.useState("");
  const [picking, setPicking] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const createProjectMutation = useCreateProject();

  const resetState = () => {
    setPicked(null);
    setName("");
    setErrorMsg(null);
    setPicking(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  const handleBrowse = async () => {
    setPicking(true);
    setErrorMsg(null);
    try {
      const result = await pickAndScanFolder();
      if (result) {
        setPicked(result);
        setName(folderName(result.path));
      }
    } catch (err) {
      logger.error("AddProjectDialog", "Folder pick/scan failed", { error: String(err) });
      setErrorMsg("Failed to scan folder. Please try again.");
    } finally {
      setPicking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked || !name.trim()) return;

    setErrorMsg(null);
    try {
      await createProjectMutation.mutateAsync({
        name: name.trim(),
        rootPath: picked.path,
      });
      handleOpenChange(false);
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        setErrorMsg("A project with this folder path already exists.");
      } else {
        setErrorMsg(msg);
      }
      logger.error("AddProjectDialog", "createProject failed", { error: msg });
    }
  };

  const isPending = createProjectMutation.isPending;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[440px] rounded-lg border border-border bg-card shadow-xl",
            "data-[state=open]:animate-fade-in"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
              Add Project
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <X className="h-3.5 w-3.5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
            {/* Folder picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Project Folder</label>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex-1 rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground min-h-[30px] flex items-center",
                    !picked && "text-muted-foreground"
                  )}
                >
                  {picked ? picked.path : "No folder selected"}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBrowse}
                  disabled={picking || isPending}
                  className="shrink-0"
                >
                  {picking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FolderOpen className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5">Browse…</span>
                </Button>
              </div>
            </div>

            {/* Scan badges */}
            {picked && (
              <div className="flex flex-wrap items-center gap-2">
                {picked.scan.hasGit && (
                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                    <GitBranch className="h-3 w-3" />
                    {picked.scan.gitBranch ?? "git"}
                  </span>
                )}
                {picked.scan.hasDockerCompose && (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-2xs font-medium text-blue-400">
                    <Container className="h-3 w-3" />
                    docker-compose
                  </span>
                )}
                {picked.scan.hasEnvFile && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-400">
                    <FileKey className="h-3 w-3" />
                    .env
                  </span>
                )}
              </div>
            )}

            {/* Name field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-name" className="text-xs font-medium text-foreground">
                Project Name
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                disabled={isPending}
                className={cn(
                  "rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "disabled:opacity-50"
                )}
              />
            </div>

            {/* Error message */}
            {errorMsg && (
              <p className="text-xs text-destructive">{errorMsg}</p>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!picked || !name.trim() || isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : null}
                Add Project
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
