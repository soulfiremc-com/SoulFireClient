export function containerMutationOptions(
  instanceId: string,
  botId: string,
  menuId: string | undefined,
  action: "click" | "close" | "button" | "text",
) {
  // Changing the key resets the observer before it can adopt another menu's scope.
  return {
    mutationKey: ["bot", "container", action, instanceId, botId, menuId],
    scope: { id: JSON.stringify(["bot-container", instanceId, botId, menuId]) },
  };
}
