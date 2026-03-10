import { Bot, Server, Cpu } from "lucide-react";
import { useProjectsStore } from "@/stores/projects.store";
import { useAgentsStore } from "@/stores/agents.store";
import { useMcpStore } from "@/stores/mcp.store";

export function StatusBar() {
  const { selectedProjectId } = useProjectsStore();
  const { sessionsByProject } = useAgentsStore();
  const { serversByProject } = useMcpStore();

  const sessions = selectedProjectId ? (sessionsByProject[selectedProjectId] ?? []) : [];
  const mcpServers = selectedProjectId ? (serversByProject[selectedProjectId] ?? []) : [];

  const runningSessions = sessions.filter((s) => s.status === "running").length;
  const runningMcp = mcpServers.filter((s) => s.status === "running").length;

  return (
    <footer className="flex items-center justify-between h-6 px-3 border-t border-border bg-card shrink-0">
      <div className="flex items-center gap-4">
        {/* Agent sessions */}
        <div className="flex items-center gap-1 text-2xs text-muted-foreground">
          <Bot className="h-3 w-3" />
          <span>
            {runningSessions > 0 ? (
              <span className="text-status-running">{runningSessions} running</span>
            ) : (
              `${sessions.length} sessions`
            )}
          </span>
        </div>

        {/* MCP servers */}
        <div className="flex items-center gap-1 text-2xs text-muted-foreground">
          <Server className="h-3 w-3" />
          <span>
            {runningMcp > 0 ? (
              <span className="text-status-running">{runningMcp} MCP active</span>
            ) : (
              `${mcpServers.length} MCP`
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Cpu className="h-3 w-3" />
        <span>DevHub</span>
      </div>
    </footer>
  );
}
