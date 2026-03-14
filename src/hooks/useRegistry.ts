import { useQuery } from "@tanstack/react-query";
import { listDriverManifests } from "@/lib/tauri";
import { useRegistryStore } from "@/stores/registry.store";

export function useRegistry() {
  const setManifests = useRegistryStore((s) => s.setManifests);
  return useQuery({
    queryKey: ["driver-manifests"],
    queryFn: async () => {
      const manifests = await listDriverManifests();
      setManifests(manifests);
      return manifests;
    },
  });
}
