export type SettingMutationTarget =
  | { type: "server" }
  | { type: "instance"; instanceId: string }
  | { type: "bot"; instanceId: string; botId: string };

export function settingMutationOptions(
  target: SettingMutationTarget,
  namespace: string,
  key: string,
  action: "value" | "reset" | "toggle",
) {
  const targetKey =
    target.type === "server"
      ? [target.type]
      : target.type === "instance"
        ? [target.type, target.instanceId]
        : [target.type, target.instanceId, target.botId];
  return {
    mutationKey: ["setting", ...targetKey, namespace, key, action],
    scope: { id: JSON.stringify(["setting", ...targetKey, namespace, key]) },
  };
}
