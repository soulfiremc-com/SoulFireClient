/**
 * Query keys shared by queries, optimistic writes, and invalidations. Build
 * keys here so a writer and the query it updates cannot drift apart.
 */
export const queryKeys = {
  clientData: () => ["client-data"],
  instanceList: () => ["instance-list"],
  instanceInfo: (instanceId: string) => ["instance-info", instanceId],
  instanceMetrics: (instanceId: string) => ["instance-metrics", instanceId],
  instanceAuditLog: (instanceId: string) => ["instance-audit-log", instanceId],
  pluginStats: (instanceId: string) => ["plugin-stats", instanceId],
  botStatus: (instanceId: string) => ["bot-status", instanceId],
  botInfo: (instanceId: string, botId: string) => [
    "bot-info",
    instanceId,
    botId,
  ],
  scripts: (instanceId: string) => ["scripts", instanceId],
  script: (instanceId: string, scriptId: string) => [
    "script",
    instanceId,
    scriptId,
  ],
  scriptStatus: (instanceId: string, scriptId: string) => [
    "script-status",
    instanceId,
    scriptId,
  ],
  serverInfo: () => ["server-info"],
  serverMetrics: () => ["server-metrics"],
  users: () => ["users"],
} satisfies Record<string, (...args: never[]) => string[]>;
