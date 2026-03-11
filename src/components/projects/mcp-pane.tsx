import { Server, Plus, Loader2, Trash2, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useMcpServersQuery } from "@/hooks/useProject";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteMcpServer, startMcpServer, stopMcpServer } from "@/lib/tauri";
import { projectKeys } from "@/hooks/useProject";
import type { McpServer, McpServerStatus } from "@/types/mcp";

interface McpPaneProps {
  projectId: string;
}

function statusVariant(
  status: McpServerStatus
): "running" | "stopped" | "error" {
  switch (status) {
    case "running":
      return "running";
    case "error":
      return "error";
    default:
      return "stopped";
  }
}

interface McpServerRowProps {
  server: McpServer;
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  isActioning: boolean;
}

function McpServerRow({
  server,
  onDelete,
  onStart,
  onStop,
  isActioning,
}: McpServerRowProps) {
  const isRunning = server.status === "running";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded border border-border bg-card",
        "hover:border-border/80 transition-colors group"
      )}
    >
      <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{server.name}</p>
        <p className="text-2xs text-muted-foreground font-mono truncate">{server.command}</p>
      </div>
      {server.port && (
        <span className="text-2xs text-muted-foreground font-mono">:{server.port}</span>
      )}
      <Badge variant={statusVariant(server.status)}>{server.status}</Badge>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => (isRunning ? onStop(server.id) : onStart(server.id))}
          disabled={isActioning}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label={isRunning ? "Stop server" : "Start server"}
        >
          {isActioning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isRunning ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => onDelete(server.id)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete MCP server"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function McpPane({ projectId }: McpPaneProps) {
  const { data: servers, isLoading, error } = useMcpServersQuery(projectId);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.mcpServers(projectId) });
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => startMcpServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.mcpServers(projectId) });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => stopMcpServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.mcpServers(projectId) });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          MCP Servers
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          disabled
        >
          <Plus className="h-3 w-3" />
          Add server
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
            <p className="text-xs text-destructive px-1">Failed to load MCP servers</p>
          )}

          {!isLoading && !error && servers?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Server className="h-10 w-10 text-muted-foreground/20" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground mb-1">
                  No MCP servers configured
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Register MCP servers to inject into agent sessions.
                </p>
                <Button variant="outline" size="sm" className="text-xs" disabled>
                  <Plus className="h-3 w-3" />
                  Add server
                </Button>
              </div>
            </div>
          )}

          {servers?.map((server) => (
            <McpServerRow
              key={server.id}
              server={server}
              onDelete={(id) => deleteMutation.mutate(id)}
              onStart={(id) => startMutation.mutate(id)}
              onStop={(id) => stopMutation.mutate(id)}
              isActioning={
                (startMutation.isPending || stopMutation.isPending) &&
                (startMutation.variables === server.id ||
                  stopMutation.variables === server.id)
              }
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
