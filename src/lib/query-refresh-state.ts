import type { Query } from "@tanstack/react-query";

export function hasFailedRefresh(query: Pick<Query, "isActive" | "state">) {
  return (
    query.isActive() &&
    query.state.data !== undefined &&
    (query.state.fetchFailureCount > 0 || query.state.status === "error")
  );
}
