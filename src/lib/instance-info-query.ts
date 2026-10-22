import { createClient, type Transport } from "@connectrpc/connect";
import type { QueryClient } from "@tanstack/react-query";
import { InstanceService } from "@/generated/soulfire/instance_pb";
import {
  convertFromInstanceProto,
  type InstanceInfoQueryData,
} from "@/lib/types.ts";

export async function fetchInstanceInfo(
  transport: Transport,
  instance: string,
  client: QueryClient,
  signal?: AbortSignal,
): Promise<InstanceInfoQueryData> {
  const queryKey = ["instance-info", instance];
  const previousData = client.getQueryData<InstanceInfoQueryData>(queryKey);
  // Invalidated data can contain optimistic edits that the server rejected.
  const lastModified = client.getQueryState(queryKey)?.isInvalidated
    ? undefined
    : previousData?.lastModified;
  const result = await createClient(InstanceService, transport).getInstanceInfo(
    { id: instance, ifModifiedSince: lastModified },
    { signal },
  );

  if (result.result.case === "notModified") {
    if (!previousData) throw new Error("No cached data available");
    const unchanged = result.result.value;
    if (!unchanged.botSummary && unchanged.instancePermissions.length === 0) {
      return previousData;
    }
    return {
      ...previousData,
      lastModified: unchanged.lastModified ?? previousData.lastModified,
      instancePermissions:
        unchanged.instancePermissions.length > 0
          ? unchanged.instancePermissions
          : previousData.instancePermissions,
      botSummary: unchanged.botSummary ?? previousData.botSummary,
    };
  }
  if (result.result.case !== "info") {
    throw new Error("Unexpected response type");
  }
  const info = result.result.value;
  return {
    id: instance,
    profile: convertFromInstanceProto(info.config),
    ...info,
  };
}
