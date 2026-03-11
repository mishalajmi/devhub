import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Bot, Database, Server, Sparkles, FolderGit2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectTab = "agents" | "resources" | "mcp" | "skills" | "code";

interface ProjectTabsProps {
  activeTab: ProjectTab;
  onTabChange: (tab: ProjectTab) => void;
  children: React.ReactNode;
}

const TABS: { value: ProjectTab; label: string; icon: React.ElementType }[] = [
  { value: "agents", label: "Agents", icon: Bot },
  { value: "resources", label: "Resources", icon: Database },
  { value: "mcp", label: "MCPs", icon: Server },
  { value: "skills", label: "Skills", icon: Sparkles },
  { value: "code", label: "Code", icon: FolderGit2 },
];

export function ProjectTabs({ activeTab, onTabChange, children }: ProjectTabsProps) {
  return (
    <TabsPrimitive.Root
      value={activeTab}
      onValueChange={(v) => onTabChange(v as ProjectTab)}
      className="flex flex-col h-full"
    >
      <TabsPrimitive.List className="flex items-center gap-0 border-b border-border px-3 shrink-0 bg-card">
        {TABS.map(({ value, label, icon: Icon }) => (
          <TabsPrimitive.Trigger
            key={value}
            value={value}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
              "focus-visible:outline-none",
              "data-[state=active]:border-primary data-[state=active]:text-foreground",
              "data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground",
              "hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </TabsPrimitive.Root>
  );
}

export function TabContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("h-full overflow-hidden data-[state=inactive]:hidden", className)}
      {...props}
    />
  );
}
