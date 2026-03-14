export interface Skill {
  id: string;
  projectId: string | null; // null = global skill
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillInput {
  projectId?: string;
  title: string;
  content: string;
  tags?: string[];
}

export interface UpdateSkillInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
}
