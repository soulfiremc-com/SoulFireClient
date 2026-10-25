export function botSettingMutationOptions(
  instanceId: string,
  botId: string,
  namespace: string,
  key: string,
  action: "value" | "reset" | "toggle",
) {
  return {
    mutationKey: ["bot", "setting", action, instanceId, botId, namespace, key],
    scope: {
      id: JSON.stringify(["bot-setting", instanceId, botId, namespace, key]),
    },
  };
}
