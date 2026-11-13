export function dialogMutationOptions(
  instanceId: string,
  botId: string,
  screenId: string | undefined,
) {
  return {
    mutationKey: ["bot", "dialog", "submit", instanceId, botId, screenId],
    scope: { id: JSON.stringify(["bot-dialog", instanceId, botId, screenId]) },
  };
}
