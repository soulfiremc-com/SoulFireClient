// Static check for translation keys used in source files.
//
// The scanner reads source text with regular expressions. It understands the
// patterns this repository uses: `useTranslation` bindings (including aliases
// such as `{ t: tCommon }`), `TFunction<"ns">` parameters, `i18n.t`, `.t` on
// parameters of type `i18n`, `t` imported from i18next, `<Trans
// i18nKey>`, and fully qualified `"ns:key"` string literals anywhere in source.
// Template literal keys become patterns that must match at least one key.
// Keys built only from variables cannot be checked and are counted as dynamic.
//
// Run `node scripts/translation-keys.ts` for a report of missing and unused
// en-US keys, and for translations whose placeholders or syntax do not match
// en-US. scripts/translation-keys.test.ts fails on missing keys and on plural
// problems: a plural key called without `count`, or `count` passed to a key
// that has neither plural forms nor `{{count}}`.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";

const DEFAULT_NAMESPACE = "common";
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

const CatalogJson = Schema.fromJsonString(Schema.Json);

export interface Catalog {
  leaves: Set<string>;
  bases: Set<string>;
  /** Keys without plural suffixes whose text puts a word after `{{count}}`. */
  countWithoutPlural: Set<string>;
  /** Base keys that read `count`: they have plural forms or use `{{count}}`. */
  readsCount: Set<string>;
}

interface Literal {
  template: boolean;
  value: string;
}

export type Reference =
  | { path: string; line: number; dynamic: string }
  | {
      path: string;
      line: number;
      dynamic?: undefined;
      namespaces: string[];
      key: string;
      template: boolean;
      hasCount: boolean;
      /** False when the call picks one of several keys, as in a ternary. */
      soleKey: boolean;
    };

export interface Finding {
  location: string;
  key: string;
  reason?: string;
}

export interface TranslationKeyReport {
  missing: Finding[];
  missingPlurals: Finding[];
  unpairedPlurals: string[];
  countWithoutPlural: string[];
  unused: string[];
  dynamic: Finding[];
  uncheckedDynamic: Finding[];
  staleAllowlist: string[];
}

/** Flatten a locale catalog into dotted leaf keys and their values. */
function flatten(
  value: Schema.Json,
  prefix: string,
  result: Map<string, string>,
): Map<string, string> {
  if (value === null || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object") {
      flatten(child, path, result);
    } else {
      result.set(path, String(child));
    }
  }
  return result;
}

// A word after the count, as in "{{count}} proxies", needs plural forms.
const COUNTED_WORD = /\{\{\s*count\s*\}\}\s+\p{L}/u;
const COUNT_PLACEHOLDER = /\{\{\s*count\s*[,}]/u;

function stripPlural(key: string): string {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) return key.slice(0, -suffix.length);
  }
  return key;
}

export function loadCatalogs(localeDirectory: string): Map<string, Catalog> {
  const catalogs = new Map<string, Catalog>();
  for (const file of readdirSync(localeDirectory).toSorted()) {
    if (!file.endsWith(".json")) continue;
    const namespace = file.slice(0, -".json".length);
    const json = Schema.decodeSync(CatalogJson)(
      readFileSync(join(localeDirectory, file), "utf8"),
    );
    const values = flatten(json, "", new Map());
    const leaves = new Set(values.keys());
    const bases = new Set([...leaves].map((key) => stripPlural(key)));
    const countWithoutPlural = new Set(
      [...values]
        .filter(
          ([key, text]) => stripPlural(key) === key && COUNTED_WORD.test(text),
        )
        .map(([key]) => key),
    );
    const readsCount = new Set(
      [...values]
        .filter(
          ([key, text]) =>
            stripPlural(key) !== key || COUNT_PLACEHOLDER.test(text),
        )
        .map(([key]) => stripPlural(key)),
    );
    catalogs.set(namespace, { leaves, bases, countWithoutPlural, readsCount });
  }
  return catalogs;
}

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated") continue;
      files.push(...listSourceFiles(path));
    } else if (
      /\.(ts|tsx)$/u.test(entry.name) &&
      !/\.(test|stories)\.tsx?$/u.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(path);
    }
  }
  return files.toSorted(compareStrings);
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}

/**
 * Read one JavaScript expression starting at `start` and return its text.
 * Stops at a top-level `,` or at the closing bracket of the enclosing call.
 */
function readArgument(
  source: string,
  start: number,
): { text: string; end: number } {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const char = source[i];
    if (char === '"' || char === "'" || char === "`") {
      i = skipString(source, i);
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth++;
    if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) break;
      depth--;
    }
    if (char === "," && depth === 0) break;
    i++;
  }
  return { text: source.slice(start, i), end: i };
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length && source[i] !== quote) {
    if (source[i] === "\\") i++;
    else if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (source[i] === "{") depth++;
        if (source[i] === "}") depth--;
        if (depth > 0) i++;
      }
    }
    i++;
  }
  return i + 1;
}

/** Collect the string and template literals inside an expression. */
function literalsIn(expression: string): Literal[] {
  const literals: Literal[] = [];
  // Drop literals in comparisons and nested calls, such as
  // `phase === "saving" ? "a" : "b"` or `list.includes("buy") ? "a" : "b"`.
  const text = expression
    .replaceAll(/[=!]==?\s*(["'`])(?:(?!\1).)*\1/gu, "")
    .replaceAll(/(["'`])(?:(?!\1).)*\1\s*[=!]==?/gu, "")
    .replaceAll(/\w\(\s*(["'`])(?:(?!\1).)*\1\s*\)/gu, "");
  const pattern = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`]*)`/gu;
  for (const match of text.matchAll(pattern)) {
    if (match[3] !== undefined) {
      literals.push({ template: true, value: match[3] });
    } else {
      literals.push({ template: false, value: match[1] ?? match[2] ?? "" });
    }
  }
  return literals;
}

function stringArguments(text: string): string[] {
  return literalsIn(text)
    .filter((literal) => !literal.template)
    .map((literal) => literal.value);
}

/** Find which namespaces each translation function name uses in a file. */
function translationBindings(source: string): Map<string, Set<string>> {
  const bindings = new Map<string, Set<string>>();
  const add = (name: string, namespaces: Iterable<string>): void => {
    const current = bindings.get(name) ?? new Set<string>();
    for (const namespace of namespaces) current.add(namespace);
    bindings.set(name, current);
  };
  for (const match of source.matchAll(
    /\{([^{}]*)\}\s*=\s*useTranslation\(([^)]*)\)/gu,
  )) {
    const [, names = "", argumentText = ""] = match;
    const namespaces = stringArguments(argumentText);
    const binding = /(?:^|,)\s*t\s*(?::\s*(\w+))?\s*(?:,|$)/u.exec(names);
    if (!binding) continue;
    add(
      binding[1] ?? "t",
      namespaces.length > 0 ? namespaces : [DEFAULT_NAMESPACE],
    );
  }
  for (const match of source.matchAll(
    /\b(\w+)\??\s*:\s*TFunction<\s*"(\w+)"/gu,
  )) {
    const [, name = "", namespace = ""] = match;
    add(name, [namespace]);
  }
  // Modules outside React import the default instance's `t` from i18next.
  for (const match of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*"i18next"/gu,
  )) {
    const [, names = ""] = match;
    const binding = /(?:^|,)\s*t\s*(?:as\s+(\w+))?\s*(?:,|$)/u.exec(names);
    if (binding) add(binding[1] ?? "t", [DEFAULT_NAMESPACE]);
  }
  // Plain modules receive `t` from a component as `t: (key: string) => string`.
  // Components pass the default namespace translator.
  if (
    !bindings.has("t") &&
    /\bt\??\s*:\s*\(\s*key\s*:\s*string/u.test(source)
  ) {
    add("t", [DEFAULT_NAMESPACE]);
  }
  return bindings;
}

/** Turn a template literal key into a regular expression. */
function templatePattern(template: string): RegExp {
  const parts = template.split(/\$\{[^}]*\}/u);
  const escaped = parts.map((part) =>
    part.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`),
  );
  return new RegExp(`^${escaped.join(".+")}$`, "u");
}

function splitNamespace(
  key: string,
  namespaces: ReadonlySet<string>,
  candidates: string[],
): { namespaces: string[]; key: string } {
  const separator = key.indexOf(":");
  if (separator > 0 && namespaces.has(key.slice(0, separator))) {
    return {
      namespaces: [key.slice(0, separator)],
      key: key.slice(separator + 1),
    };
  }
  return { namespaces: candidates, key };
}

/** Collect every translation key reference in the given source files. */
export function scanSources(
  files: readonly string[],
  rootDirectory: string,
  namespaces: ReadonlySet<string>,
): { references: Reference[]; strings: Set<string>; templates: string[] } {
  const references: Reference[] = [];
  const strings = new Set<string>();
  const templates: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const path = relative(rootDirectory, file);
    const bindings = translationBindings(source);
    // Source ranges already read as `t` arguments, so the literal scan below
    // does not count them twice.
    const consumed: [number, number][] = [];

    const record = (
      index: number,
      text: string,
      candidates: string[],
      hasCount: boolean,
      prefix = "",
    ): void => {
      const literals = literalsIn(text);
      if (literals.length === 0) {
        references.push({
          path,
          line: lineOf(source, index),
          dynamic: text.trim().replaceAll(/\s+/gu, " "),
        });
        return;
      }
      for (const literal of literals) {
        // Ternaries also contain unrelated literals, such as comparisons.
        if (
          !literal.template &&
          !/^[\w-]+(:[\w-]+)?(\.[\w-]+)*$/u.test(literal.value)
        ) {
          continue;
        }
        if (literal.template && !/^[\w.:${}()?\s-]+$/u.test(literal.value)) {
          continue;
        }
        const resolved = prefix
          ? { namespaces: candidates, key: prefix + literal.value }
          : splitNamespace(literal.value, namespaces, candidates);
        references.push({
          path,
          line: lineOf(source, index),
          namespaces: resolved.namespaces,
          key: resolved.key,
          template: literal.template,
          hasCount,
          soleKey: literals.length === 1,
        });
      }
    };

    // Wrappers such as `const t = (key) => i18n.t(\`common:dataTable.${key}\`)`
    // prefix every key passed to them.
    const prefixes = new Map<string, string>();
    for (const match of source.matchAll(
      /const (\w+) = \((\w+)[^)]*\)\s*=>\s*i18n\.t\(`(\w+):([\w.]*)\$\{(\w+)\}`\)/gu,
    )) {
      const [, name = "", parameter, namespace = "", prefix = "", argument] =
        match;
      if (parameter !== argument) continue;
      bindings.set(name, new Set([namespace]));
      prefixes.set(name, prefix);
    }

    // Helpers can take the i18next instance as a parameter of type `i18n`.
    const instances = new Set(["i18n.t"]);
    for (const [, name = ""] of source.matchAll(/\b(\w+)\??\s*:\s*i18n\b/gu)) {
      instances.add(`${name}.t`);
    }
    const calls = [...bindings.keys(), ...instances];
    for (const name of calls) {
      const candidates = instances.has(name)
        ? [DEFAULT_NAMESPACE]
        : [...(bindings.get(name) ?? [])];
      const prefix = prefixes.get(name) ?? "";
      const escaped = name.replace(".", String.raw`\.`);
      for (const match of source.matchAll(
        new RegExp(`(?<![\\w$.])${escaped}\\(`, "gu"),
      )) {
        const start = match.index + match[0].length;
        const argument = readArgument(source, start);
        const rest = source.slice(argument.end, argument.end + 200);
        const options = rest.startsWith(",")
          ? readArgument(source, argument.end + 1).text
          : "";
        consumed.push([start, argument.end]);
        record(
          start,
          argument.text,
          candidates,
          /\bcount\b/u.test(options),
          prefix,
        );
      }
    }

    for (const match of source.matchAll(/<Trans\b([^>]*?)\/?>/gsu)) {
      const [, attributes = ""] = match;
      const keyMatch = /i18nKey=(?:\{([^}]*)\}|("[^"]*"))/u.exec(attributes);
      if (!keyMatch) continue;
      const translator = /\bt=\{(\w+)\}/u.exec(attributes)?.[1];
      const namespace = /\bns=["{]"?(\w+)/u.exec(attributes)?.[1];
      const candidates = namespace
        ? [namespace]
        : translator && bindings.has(translator)
          ? [...(bindings.get(translator) ?? [])]
          : [DEFAULT_NAMESPACE];
      record(
        match.index,
        keyMatch[1] ?? keyMatch[2] ?? "",
        candidates,
        /\bcount\b/u.test(attributes),
      );
    }

    // Fully qualified keys can travel through props, schema annotations, and
    // lookup tables before they reach `t`.
    for (const match of source.matchAll(/["'`]((\w+):[\w.-]+)["'`]/gu)) {
      const [, qualifiedKey = "", namespace = ""] = match;
      strings.add(qualifiedKey);
      if (!namespaces.has(namespace)) continue;
      if (
        consumed.some(
          ([start, end]) => match.index >= start && match.index < end,
        )
      ) {
        continue;
      }
      const resolved = splitNamespace(qualifiedKey, namespaces, []);
      references.push({
        path,
        line: lineOf(source, match.index),
        namespaces: resolved.namespaces,
        key: resolved.key,
        template: false,
        hasCount: false,
        soleKey: true,
      });
    }
    for (const [, key = ""] of source.matchAll(
      /["'`]([\w-]+(?:\.[\w-]+)+)["'`]/gu,
    )) {
      strings.add(key);
    }
    // Template keys built outside `t`, such as `account.types.${type}` in a
    // helper that returns the key, keep their keys from the unused report.
    for (const [, template = ""] of source.matchAll(
      /`((?:[\w-]+:)?[\w-]+(?:\.[\w-]+)*\.\$\{[^}`]+\}[\w.-]*)`/gu,
    )) {
      templates.push(template);
    }
  }

  return { references, strings, templates };
}

/** Compare source references with the en-US catalogs. */
export function checkTranslationKeys({
  rootDirectory,
  sourceDirectory = join(rootDirectory, "src"),
  localeDirectory = join(rootDirectory, "locales/en-US"),
  dynamicAllowlist = [],
}: {
  rootDirectory: string;
  sourceDirectory?: string;
  localeDirectory?: string;
  dynamicAllowlist?: readonly string[];
}): TranslationKeyReport {
  const catalogs = loadCatalogs(localeDirectory);
  const namespaces = new Set(catalogs.keys());
  const files = listSourceFiles(sourceDirectory);
  const { references, strings, templates } = scanSources(
    files,
    rootDirectory,
    namespaces,
  );

  const missing: Finding[] = [];
  const missingPlurals: Finding[] = [];
  const usedPatterns: { namespaces: string[]; pattern: RegExp }[] =
    templates.map((template) => {
      const resolved = splitNamespace(template, namespaces, [...namespaces]);
      return {
        namespaces: resolved.namespaces,
        pattern: templatePattern(resolved.key),
      };
    });
  const usedKeys = new Set<string>();
  const dynamic: Finding[] = [];

  for (const reference of references) {
    if (reference.dynamic !== undefined) {
      dynamic.push({
        location: `${reference.path}:${reference.line}`,
        key: `${reference.path} ${reference.dynamic}`,
      });
      continue;
    }
    const location = `${reference.path}:${reference.line}`;
    if (reference.template) {
      const pattern = templatePattern(reference.key);
      const found = reference.namespaces.some((namespace) =>
        [...(catalogs.get(namespace)?.bases ?? [])].some((key) =>
          pattern.test(key),
        ),
      );
      usedPatterns.push({ namespaces: reference.namespaces, pattern });
      if (!found) {
        missing.push({
          location,
          key: `${reference.namespaces.join("|")}:${reference.key}`,
        });
      }
      continue;
    }
    const namespace = reference.namespaces.find((candidate) =>
      catalogs.get(candidate)?.bases.has(reference.key),
    );
    const catalog =
      namespace === undefined ? undefined : catalogs.get(namespace);
    if (namespace === undefined || catalog === undefined) {
      missing.push({
        location,
        key: `${reference.namespaces.join("|")}:${reference.key}`,
      });
      continue;
    }
    usedKeys.add(`${namespace}:${reference.key}`);
    const { leaves } = catalog;
    if (!leaves.has(reference.key) && !leaves.has(`${reference.key}_other`)) {
      // Only plural forms exist, so a call without `count` returns the key.
      missingPlurals.push({
        location,
        key: `${namespace}:${reference.key}`,
        reason: "no _other form",
      });
    } else if (!leaves.has(reference.key) && !reference.hasCount) {
      missingPlurals.push({
        location,
        key: `${namespace}:${reference.key}`,
        reason: "plural key used without count",
      });
    } else if (
      reference.hasCount &&
      reference.soleKey &&
      !catalog.readsCount.has(reference.key)
    ) {
      // The text ignores the count, so "1 bot" and "5 bots" read the same.
      // A ternary may pass the count for only one of its keys.
      missingPlurals.push({
        location,
        key: `${namespace}:${reference.key}`,
        reason: "count passed to a key without plural forms or {{count}}",
      });
    }
  }

  const unpairedPlurals: string[] = [];
  for (const [namespace, { leaves }] of catalogs) {
    for (const key of leaves) {
      if (key.endsWith("_one") && !leaves.has(`${stripPlural(key)}_other`)) {
        unpairedPlurals.push(`${namespace}:${key}`);
      }
    }
  }

  const countWithoutPlural: string[] = [];
  for (const [namespace, catalog] of catalogs) {
    for (const key of catalog.countWithoutPlural) {
      countWithoutPlural.push(`${namespace}:${key}`);
    }
  }

  const unused: string[] = [];
  for (const [namespace, { bases }] of catalogs) {
    for (const key of bases) {
      if (usedKeys.has(`${namespace}:${key}`)) continue;
      if (strings.has(key) || strings.has(`${namespace}:${key}`)) continue;
      if (
        usedPatterns.some(
          (used) =>
            used.namespaces.includes(namespace) && used.pattern.test(key),
        )
      ) {
        continue;
      }
      unused.push(`${namespace}:${key}`);
    }
  }

  const allowed = new Set(dynamicAllowlist);
  return {
    missing,
    missingPlurals,
    unpairedPlurals,
    countWithoutPlural,
    unused,
    dynamic,
    uncheckedDynamic: dynamic.filter(({ key }) => !allowed.has(key)),
    staleAllowlist: dynamicAllowlist.filter(
      (entry) => !dynamic.some(({ key }) => key === entry),
    ),
  };
}

const PLACEHOLDER = /\{\{\s*([^\s,}]+)[^}]*\}\}/gu;
// i18next JSON does not read ICU MessageFormat. Such text shows as written.
const ICU_SYNTAX = /\{\s*\w+\s*,\s*(?:plural|select|selectordinal)\s*,/u;

function placeholders(text: string): Set<string> {
  return new Set(
    Array.from(text.matchAll(PLACEHOLDER), (match) => match[1] ?? ""),
  );
}

function loadValues(directory: string, file: string): Map<string, string> {
  const json = Schema.decodeSync(CatalogJson)(
    readFileSync(join(directory, file), "utf8"),
  );
  return flatten(json, "", new Map());
}

export interface LocaleReport {
  /**
   * Translations that use a placeholder the en-US text for the same key does
   * not have, as `locale ns:key {{name}}`. i18next leaves such a placeholder
   * as literal text unless the call site still passes that value.
   */
  placeholderMismatches: string[];
  /** Strings written in ICU MessageFormat, as `locale ns:key`. */
  icuStrings: string[];
}

/**
 * Compare every translated catalog with en-US. Keys that en-US no longer has
 * are skipped, because Crowdin removes them on the next sync.
 */
export function checkLocales({
  rootDirectory,
  sourceLocale = "en-US",
}: {
  rootDirectory: string;
  sourceLocale?: string;
}): LocaleReport {
  const localesDirectory = join(rootDirectory, "locales");
  const sourceDirectory = join(localesDirectory, sourceLocale);
  const placeholderMismatches: string[] = [];
  const icuStrings: string[] = [];

  for (const file of readdirSync(sourceDirectory).toSorted()) {
    if (!file.endsWith(".json")) continue;
    const namespace = file.slice(0, -".json".length);
    const source = loadValues(sourceDirectory, file);
    // A translation can use any placeholder of the key's plural forms, and
    // `count` whenever the key has plural forms.
    const allowed = new Map<string, Set<string>>();
    for (const [key, text] of source) {
      const base = stripPlural(key);
      const names = allowed.get(base) ?? new Set<string>();
      for (const name of placeholders(text)) names.add(name);
      if (base !== key) names.add("count");
      allowed.set(base, names);
    }

    for (const locale of readdirSync(localesDirectory).toSorted()) {
      let values: Map<string, string>;
      try {
        values = loadValues(join(localesDirectory, locale), file);
      } catch {
        continue;
      }
      for (const [key, text] of values) {
        if (ICU_SYNTAX.test(text)) {
          icuStrings.push(`${locale} ${namespace}:${key}`);
        }
        if (locale === sourceLocale) continue;
        const names = allowed.get(stripPlural(key));
        if (!names) continue;
        for (const name of placeholders(text)) {
          if (!names.has(name)) {
            placeholderMismatches.push(
              `${locale} ${namespace}:${key} {{${name}}}`,
            );
          }
        }
      }
    }
  }

  return { placeholderMismatches, icuStrings };
}

function print(title: string, items: readonly (Finding | string)[]): void {
  process.stdout.write(`${title}: ${items.length}\n`);
  for (const item of items) {
    process.stdout.write(
      typeof item === "string"
        ? `  ${item}\n`
        : `  ${item.location} ${item.key}${item.reason ? ` (${item.reason})` : ""}\n`,
    );
  }
}

if (process.argv[1] === import.meta.filename) {
  const rootDirectory = fileURLToPath(new URL("..", import.meta.url));
  const result = checkTranslationKeys({ rootDirectory });
  print("Missing keys", result.missing);
  print("Plural problems", result.missingPlurals);
  print("Unpaired plural forms", result.unpairedPlurals);
  print("Counts without plural forms", result.countWithoutPlural);
  print("Dynamic keys", result.dynamic);
  print("Unused keys", result.unused);
  const locales = checkLocales({ rootDirectory });
  print("Placeholders that en-US does not have", locales.placeholderMismatches);
  print("ICU MessageFormat strings", locales.icuStrings);
}

// Matches the default sort order, which compares UTF-16 code units.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
