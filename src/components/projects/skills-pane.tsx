import { Sparkles, Plus, Loader2, Trash2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useSkillsQuery } from "@/hooks/useProject";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteSkill } from "@/lib/tauri";
import { projectKeys } from "@/hooks/useProject";
import type { Skill } from "@/types/skill";

interface SkillsPaneProps {
  projectId: string;
}

interface SkillCardProps {
  skill: Skill;
  onDelete: (id: string) => void;
}

function SkillCard({ skill, onDelete }: SkillCardProps) {
  const isGlobal = skill.projectId === null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 px-3 py-2.5 rounded border border-border bg-card",
        "hover:border-border/80 transition-colors group"
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-xs font-medium text-foreground flex-1 truncate">{skill.title}</p>
        {isGlobal && (
          <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <button
          onClick={() => onDelete(skill.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          aria-label="Delete skill"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {skill.content.length > 0 && (
        <p className="text-2xs text-muted-foreground line-clamp-2 ml-5">
          {skill.content}
        </p>
      )}
      {skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-5">
          {skill.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function SkillsPane({ projectId }: SkillsPaneProps) {
  const { data: skills, isLoading, error } = useSkillsQuery(projectId);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.skills(projectId) });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Skills
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          disabled
        >
          <Plus className="h-3 w-3" />
          Add skill
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
            <p className="text-xs text-destructive px-1">Failed to load skills</p>
          )}

          {!isLoading && !error && skills?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Sparkles className="h-10 w-10 text-muted-foreground/20" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground mb-1">
                  No skills yet
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Add reusable prompt skills to inject into agent sessions.
                </p>
                <Button variant="outline" size="sm" className="text-xs" disabled>
                  <Plus className="h-3 w-3" />
                  Add skill
                </Button>
              </div>
            </div>
          )}

          {skills?.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
