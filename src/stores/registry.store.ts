import { AgentDriverManifest } from "@devhub/types";
import { create } from "zustand";

interface RegistryState {
  manifests: AgentDriverManifest[];
  setManifests: (manifests: AgentDriverManifest[]) => void;
}

export const useRegistryStore = create<RegistryState>((set) => ({
  manifests: [],
  setManifests: (manifests) => set({ manifests }),
}));
