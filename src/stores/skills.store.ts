import { create } from "zustand";
import type { Skill } from "@/types/skill";

interface SkillsState {
  skills: Skill[];

  setSkills: (skills: Skill[]) => void;
  addSkill: (skill: Skill) => void;
  updateSkill: (updated: Skill) => void;
  removeSkill: (id: string) => void;
}

export const useSkillsStore = create<SkillsState>((set) => ({
  skills: [],

  setSkills: (skills) => set({ skills }),

  addSkill: (skill) =>
    set((state) => ({ skills: [...state.skills, skill] })),

  updateSkill: (updated) =>
    set((state) => ({
      skills: state.skills.map((s) => (s.id === updated.id ? updated : s)),
    })),

  removeSkill: (id) =>
    set((state) => ({ skills: state.skills.filter((s) => s.id !== id) })),
}));
