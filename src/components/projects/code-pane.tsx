import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Folder,
  FolderOpen,
  File,
  Loader2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listDirTree } from "@/lib/tauri";
import type { DirNode } from "@/types/project";

interface CodePaneProps {
  projectId: string;
  rootPath: string;
}

interface TreeNodeProps {
  node: DirNode;
  depth: number;
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);

  const hasChildren = node.isDir && node.children.length > 0;
  const indent = depth * 12;

  return (
    <div>
      <button
        onClick={() => node.isDir && setExpanded((prev) => !prev)}
        className={cn(
          "flex items-center gap-1.5 w-full text-left px-2 py-0.5 rounded",
          "text-xs transition-colors",
          node.isDir
            ? "text-foreground hover:bg-accent cursor-pointer"
            : "text-muted-foreground hover:bg-accent/50 cursor-default"
        )}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {node.isDir ? (
          <>
            <span className="text-muted-foreground w-3 shrink-0">
              {hasChildren ? (
                expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )
              ) : (
                <span className="w-3" />
              )}
            </span>
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {node.isDir && expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CodePane({ projectId, rootPath }: CodePaneProps) {
  const { data: tree, isLoading, error } = useQuery<DirNode[]>({
    queryKey: ["projects", projectId, "dirTree"],
    queryFn: () => listDirTree(rootPath),
    enabled: Boolean(rootPath),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Project Files
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive px-4 py-2">
              Failed to read project directory
            </p>
          )}

          {!isLoading && !error && tree?.length === 0 && (
            <p className="text-xs text-muted-foreground px-4 py-2">
              Directory is empty
            </p>
          )}

          {tree?.map((node) => (
            <TreeNode key={node.path} node={node} depth={0} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
