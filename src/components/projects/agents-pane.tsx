/**
 * AgentsPane — session manager UI.
 *
 * TODO (chunk 13): Implement full session manager UI using the driver shim
 * model (getDriverShim, useStartSession, useResumeSession, useSendMessage,
 * useAbortSession, useStopSession, useRemoteSessions).
 */

import { Bot } from "lucide-react";

interface AgentsPaneProps {
  projectId: string;
  isActive?: boolean;
}

export function AgentsPane({ projectId }: AgentsPaneProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 gap-3 px-6">
      <Bot className="h-10 w-10 text-muted-foreground/20" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground mb-1">Agent Sessions</p>
        <p className="text-xs text-muted-foreground">
          Session manager UI coming in chunk 13.
        </p>
        <p className="text-2xs text-muted-foreground/60 mt-1 font-mono">{projectId}</p>
      </div>
    </div>
  );
}
