import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkTranslationKeys } from "./translation-keys.mjs";

const rootDirectory = fileURLToPath(new URL("..", import.meta.url));

// Keys that come from variables cannot be checked statically. Each entry names
// the file and the argument passed to `t` or `i18nKey`. Keep the keys these
// expressions return in literal tables or switch statements in the same file,
// so the unused key report still sees them.
const dynamicAllowlist = [
  // Forwards the component translator to createPaletteCommands, whose keys
  // are checked in src/lib/command-palette.ts.
  "src/components/command-palette.tsx key",
  // Switch over audit log entry types that returns literal keys.
  "src/components/instance-overview/activity-timeline.tsx entryTypeI18nKey(entry.type)",
  "src/routes/_dashboard/instance/$instance/audit-log.tsx toI18nKey(row.original.type)",
  // Lookup tables of literal `labelKey` values.
  "src/components/instance-overview/bot-grid.tsx meta.labelKey",
  "src/components/instance-overview/fleet-status.tsx fix.labelKey",
  "src/components/instance-setup/first-bot-setup.tsx fix.labelKey",
  "src/routes/_dashboard/instance/$instance/bot/$botId.tsx fix.labelKey",
  // Inline tuples of [value, literal key] for provider choice cards.
  "src/components/providers/flows/fernan-flow.tsx label",
  "src/components/providers/flows/localts-flow.tsx label",
  // Switch over credential types that returns literal format hint keys.
  "src/routes/_dashboard/instance/$instance/accounts.tsx credentialFormatKey(credentialType)",
  "src/routes/_dashboard/instance/$instance/accounts.tsx credentialFormatKey(accountTypeCredentialsSelected)",
];

function format(items) {
  return items
    .map(
      (item) =>
        `${item.location} ${item.key}${item.reason ? ` (${item.reason})` : ""}`,
    )
    .join("\n");
}

test("source translation keys exist in en-US", () => {
  const result = checkTranslationKeys({ rootDirectory, dynamicAllowlist });

  assert.deepEqual(
    result.missing,
    [],
    `Missing keys:\n${format(result.missing)}`,
  );
  assert.deepEqual(
    result.missingPlurals,
    [],
    `Plural problems:\n${format(result.missingPlurals)}`,
  );
  assert.deepEqual(
    result.unpairedPlurals,
    [],
    "Every _one key needs an _other key",
  );
  assert.deepEqual(
    result.uncheckedDynamic,
    [],
    `Dynamic keys need a dynamicAllowlist entry:\n${format(result.uncheckedDynamic)}`,
  );
  assert.deepEqual(
    result.staleAllowlist,
    [],
    "Remove dynamicAllowlist entries that no longer match source",
  );
});

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "translation-keys-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return checkTranslationKeys({ rootDirectory: root });
}

const catalogs = {
  "locales/en-US/common.json": JSON.stringify({
    save: "Save",
    dataTable: { clear: "Clear" },
    bots_one: "{{count}} bot",
    bots_other: "{{count}} bots",
    status: { online: "Online", offline: "Offline" },
    unused: "Unused",
  }),
  "locales/en-US/instance.json": JSON.stringify({
    title: "Instance",
    proxy: { added: "Added" },
  }),
};

test("resolves keys against the namespace bound to each translator", (t) => {
  const result = fixture(t, {
    ...catalogs,
    "src/page.tsx": `
      function Page() {
        const { t } = useTranslation("instance");
        const { t: tCommon } = useTranslation("common");
        return [
          t("title"),
          t("common:save"),
          t("save"),
          tCommon("save"),
          tCommon("title"),
          <Trans i18nKey="instance:proxy.added" />,
          <Trans t={t} i18nKey="proxy.missing" />,
        ];
      }
    `,
  });

  assert.deepEqual(
    result.missing.map((item) => item.key),
    ["instance:save", "common:title", "instance:proxy.missing"],
  );
  assert.deepEqual(result.unused, [
    "common:dataTable.clear",
    "common:bots",
    "common:status.online",
    "common:status.offline",
    "common:unused",
  ]);
});

test("checks templates, ternaries, wrappers, and qualified literals", (t) => {
  const result = fixture(t, {
    ...catalogs,
    "src/status.tsx": `
      function Status({ online, kind }) {
        const { t } = useTranslation();
        return [
          t(\`status.\${online ? "online" : "offline"}\`),
          t(\`missing.\${kind}\`),
          t(kind === "bot" ? "save" : "absent"),
          t(kind),
        ];
      }
    `,
    "src/table.ts": `
      const t = (key: string) => i18n.t(\`common:dataTable.\${key}\`);
      export const labels = [t("clear"), t("reset")];
      export const message = { messageMissingKey: "instance:proxy.gone" };
    `,
  });

  assert.deepEqual(result.missing.map((item) => item.key).sort(), [
    "common:absent",
    "common:dataTable.reset",
    "common:missing.${kind}",
    "instance:proxy.gone",
  ]);
  assert.deepEqual(
    result.dynamic.map((item) => item.key),
    ["src/status.tsx kind"],
  );
});

test("requires count for keys that only have plural forms", (t) => {
  const result = fixture(t, {
    ...catalogs,
    "src/bots.tsx": `
      function Bots({ count }) {
        const { t } = useTranslation("common");
        return [t("bots", { count }), t("bots")];
      }
    `,
  });

  assert.deepEqual(result.missing, []);
  assert.deepEqual(
    result.missingPlurals.map((item) => `${item.location} ${item.reason}`),
    ["src/bots.tsx:4 plural key used without count"],
  );
});
