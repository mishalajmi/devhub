import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { watchProject, unwatchProject, scanProjectFolder } from "@/lib/tauri";
import { useProjectsStore } from "@/stores/projects.store";
import { logger } from "@/lib/logger";

interface ProjectChangedPayload {
  projectId: string;
  changedPath: string;
}

/**
 * Manages the lifecycle of the Rust file watcher for the currently selected
 * project.  When the selected project changes:
 *   - the previous project's watcher is stopped
 *   - the new project's watcher is started
 *
 * When the backend emits `project://changed` the hook re-runs
 * `scanProjectFolder` and updates the project's metadata in the store so
 * sidebar indicators (git branch, docker, env) refresh reactively.
 */
export function useProjectWatcher(): void {
  const selectedProjectId = useProjectsStore((s) => s.selectedProjectId);

  // Keep a stable ref to the currently watched project ID so the event
  // listener closure does not need to close over stale state.
  const watchedIdRef = useRef<string | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setup = async () => {
      // Subscribe to file-change events from Rust.
      unlisten = await listen<ProjectChangedPayload>(
        "project://changed",
        async (event) => {
          const { projectId, changedPath } = event.payload;
          logger.info("useProjectWatcher", "project changed", {
            projectId,
            changedPath,
          });

          // Find the project so we can re-scan its root path.
          const project = useProjectsStore
            .getState()
            .projects.find((p) => p.id === projectId);
          if (!project) return;

          try {
            const meta = await scanProjectFolder(project.rootPath);
            useProjectsStore.getState().updateProject({ ...project, ...meta });
          } catch (err) {
            logger.error("useProjectWatcher", "re-scan failed", {
              projectId,
              err: String(err),
            });
          }
        }
      );

      // Start/stop watcher when the selected project changes.
      const previousId = watchedIdRef.current;

      if (previousId && previousId !== selectedProjectId) {
        try {
          await unwatchProject(previousId);
        } catch (err) {
          logger.warn("useProjectWatcher", "failed to unwatch project", {
            projectId: previousId,
            err: String(err),
          });
        }
      }

      if (selectedProjectId && selectedProjectId !== previousId) {
        try {
          await watchProject(selectedProjectId);
        } catch (err) {
          logger.warn("useProjectWatcher", "failed to watch project", {
            projectId: selectedProjectId,
            err: String(err),
          });
        }
      }

      watchedIdRef.current = selectedProjectId;
    };

    setup();

    return () => {
      unlisten?.();
    };
    // Re-run whenever the selected project changes.
  }, [selectedProjectId]);

  // Cleanup: stop the watcher when the component unmounts entirely.
  useEffect(() => {
    return () => {
      const id = watchedIdRef.current;
      if (id) {
        unwatchProject(id).catch((err) =>
          logger.warn("useProjectWatcher", "cleanup unwatch failed", {
            projectId: id,
            err: String(err),
          })
        );
        watchedIdRef.current = null;
      }
    };
  }, []);

}
