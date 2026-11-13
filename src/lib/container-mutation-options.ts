export function containerMutationScopeId(
  instanceId: string,
  botId: string,
  menuId: string | undefined,
) {
  return JSON.stringify(["bot-container", instanceId, botId, menuId]);
}

export function containerMutationOptions(
  instanceId: string,
  botId: string,
  menuId: string | undefined,
  action: "click" | "close" | "button" | "text",
) {
  // Changing the key resets the observer before it can adopt another menu's scope.
  return {
    mutationKey: ["bot", "container", action, instanceId, botId, menuId],
    scope: { id: containerMutationScopeId(instanceId, botId, menuId) },
  };
}
