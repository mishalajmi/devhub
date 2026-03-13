/**
 * Confirmation dialog for deleting a project resource.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDeleteResource } from "@/hooks/useProject";
import { logger } from "@/lib/logger";
import type { ProjectResource } from "@devhub/types";

interface DeleteResourceDialogProps {
  projectId: string;
  resource: ProjectResource | null;
  onClose: () => void;
}

export function DeleteResourceDialog({
  projectId,
  resource,
  onClose,
}: DeleteResourceDialogProps) {
  const deleteMutation = useDeleteResource(projectId);

  const handleConfirm = async () => {
    if (!resource) return;
    try {
      await deleteMutation.mutateAsync(resource.id);
      onClose();
    } catch (err) {
      logger.error("DeleteResourceDialog", "Failed to delete resource", { error: String(err) });
    }
  };

  return (
    <DialogPrimitive.Root open={Boolean(resource)} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[400px] rounded-lg border border-border bg-card shadow-xl",
            "data-[state=open]:animate-fade-in"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <DialogPrimitive.Title className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delete Resource
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <X className="h-3.5 w-3.5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="px-5 py-4 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">{resource?.name}</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              This resource will be permanently removed. This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirm}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : null}
                Delete
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
