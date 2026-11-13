import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { BotGetDialogResponse } from "@/generated/soulfire/bot_pb";

export async function applyServerDialogRefresh(
  client: QueryClient,
  queryKey: QueryKey,
  expectedScreenId: string,
  state: BotGetDialogResponse | undefined,
) {
  if (!state) {
    void client.invalidateQueries({ queryKey });
    return;
  }
  if (
    client.getQueryData<BotGetDialogResponse>(queryKey)?.dialog?.screenId !==
    expectedScreenId
  ) {
    return;
  }
  await client.cancelQueries({ queryKey });
  client.setQueryData<BotGetDialogResponse>(queryKey, (current) =>
    current?.dialog?.screenId === expectedScreenId ? state : current,
  );
}
