/** Built-in settings pages whose server names use title case. */
const BUILT_IN_SETTINGS_PAGES = new Set([
  "bot",
  "account",
  "proxy",
  "ai",
  "pathfinding",
  "server",
  "dev",
]);

/**
 * The display name of a settings page. The server names its built-in pages in
 * title case and in English, so they use translated sentence-case names here.
 * Plugin pages keep the name their plugin gives them.
 */
export function settingsPageName(
  page: { id: string; pageName: string; owningPluginId?: string | undefined },
  t: (key: string) => string,
): string {
  return page.owningPluginId === undefined &&
    BUILT_IN_SETTINGS_PAGES.has(page.id)
    ? t(`common:settingsPageName.${page.id}`)
    : page.pageName;
}
