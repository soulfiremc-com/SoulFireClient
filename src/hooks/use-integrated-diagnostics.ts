import { useQuery } from "@tanstack/react-query";
import { desktop, isDesktopApp } from "@/lib/desktop";

export function useIntegratedDiagnostics() {
  return useQuery({
    queryKey: ["integrated-server-diagnostics"],
    queryFn: () => desktop.integratedServer.getDiagnostics(),
    refetchInterval: 1_000,
    staleTime: 0,
    retry: false,
    enabled: isDesktopApp(),
  });
}
