import { AgentSessionStatus } from "@devhub/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function StatusBadge({ status }: { status: AgentSessionStatus }) {
  const map: Record<AgentSessionStatus, { label: string; className: string }> =
    {
      initializing: {
        label: "initializing",
        className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
      },
      idle: {
        label: "idle",
        className: "bg-green-500/15 text-green-400 border-green-500/20",
      },
      running: {
        label: "running",
        className: "bg-blue-500/15 text-blue-400 border-blue-500/20",
      },
      error: {
        label: "error",
        className: "bg-red-500/15 text-red-400 border-red-500/20",
      },
      stopped: {
        label: "stopped",
        className: "bg-muted/50 text-muted-foreground border-muted",
      },
    };
  const { label, className } = map[status] ?? map.stopped;
  return (
    <Badge
      variant="outline"
      className={cn("text-2xs px-1.5 py-0 font-mono", className)}
    >
      {status === "running" && (
        <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
      )}
      {label}
    </Badge>
  );
}
