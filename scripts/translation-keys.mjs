// Static check for translation keys used in source files.
//
// The scanner reads source text with regular expressions. It understands the
// patterns this repository uses: `useTranslation` bindings (including aliases
// such as `{ t: tCommon }`), `TFunction<"ns">` parameters, `i18n.t` and `t`
// imported from i18next, `<Trans
// i18nKey>`, and fully qualified `"ns:key"` string literals anywhere in source.
// Template literal keys become patterns that must match at least one key.
// Keys built only from variables cannot be checked and are counted as dynamic.
//
// Run `node scripts/translation-keys.mjs` for a report of missing and unused
// en-US keys. scripts/translation-keys.test.mjs fails on missing keys.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_NAMESPACE = "common";
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

/** Flatten a locale catalog into dotted leaf keys. */
function flatten(value, prefix, result) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object") {
      flatten(child, path, result);
    } else {
      result.add(path);
    }
  }
  return result;
}

function stripPlural(key) {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) return key.slice(0, -suffix.length);
  }
  return key;
}

export function loadCatalogs(localeDirectory) {
  const catalogs = new Map();
  for (const file of readdirSync(localeDirectory).toSorted()) {
    if (!file.endsWith(".json")) continue;
    const namespace = file.slice(0, -".json".length);
    const json = JSON.parse(readFileSync(join(localeDirectory, file), "utf8"));
    const leaves = flatten(json, "", new Set());
    const bases = new Set([...leaves].map(stripPlural));
    catalogs.set(namespace, { leaves, bases });
  }
  return catalogs;
}

function listSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated") continue;
      files.push(...listSourceFiles(path));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.(test|stories)\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(path);
    }
  }
  return files.toSorted(compareStrings);
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Read one JavaScript expression starting at `start` and return its text.
 * Stops at a top-level `,` or at the closing bracket of the enclosing call.
 */
function readArgument(source, start) {
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

function skipString(source, start) {
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
function literalsIn(text) {
  const literals = [];
  // Drop literals in comparisons and nested calls, such as
  // `phase === "saving" ? "a" : "b"` or `list.includes("buy") ? "a" : "b"`.
  text = text
    .replaceAll(/[=!]==?\s*(["'`])(?:(?!\1).)*\1/g, "")
    .replaceAll(/(["'`])(?:(?!\1).)*\1\s*[=!]==?/g, "")
    .replaceAll(/\w\(\s*(["'`])(?:(?!\1).)*\1\s*\)/g, "");
  const pattern = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`]*)`/g;
  for (const match of text.matchAll(pattern)) {
    if (match[3] !== undefined) {
      literals.push({ template: true, value: match[3] });
    } else {
      literals.push({ template: false, value: match[1] ?? match[2] });
    }
  }
  return literals;
}

function stringArguments(text) {
  return literalsIn(text)
    .filter((literal) => !literal.template)
    .map((literal) => literal.value);
}

/** Find which namespaces each translation function name uses in a file. */
function translationBindings(source) {
  const bindings = new Map();
  const add = (name, namespaces) => {
    const current = bindings.get(name) ?? new Set();
    for (const namespace of namespaces) current.add(namespace);
    bindings.set(name, current);
  };
  for (const match of source.matchAll(
    /\{([^{}]*)\}\s*=\s*useTranslation\(([^)]*)\)/g,
  )) {
    const namespaces = stringArguments(match[2]);
    const binding = /(?:^|,)\s*t\s*(?::\s*(\w+))?\s*(?:,|$)/.exec(match[1]);
    if (!binding) continue;
    add(
      binding[1] ?? "t",
      namespaces.length > 0 ? namespaces : [DEFAULT_NAMESPACE],
    );
  }
  for (const match of source.matchAll(
    /\b(\w+)\??\s*:\s*TFunction<\s*"(\w+)"/g,
  )) {
    add(match[1], [match[2]]);
  }
  // Modules outside React import the default instance's `t` from i18next.
  for (const match of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*"i18next"/g,
  )) {
    const binding = /(?:^|,)\s*t\s*(?:as\s+(\w+))?\s*(?:,|$)/.exec(match[1]);
    if (binding) add(binding[1] ?? "t", [DEFAULT_NAMESPACE]);
  }
  // Plain modules receive `t` from a component as `t: (key: string) => string`.
  // Components pass the default namespace translator.
  if (!bindings.has("t") && /\bt\??\s*:\s*\(\s*key\s*:\s*string/.test(source)) {
    add("t", [DEFAULT_NAMESPACE]);
  }
  return bindings;
}

/** Turn a template literal key into a regular expression. */
function templatePattern(template) {
  const parts = template.split(/\$\{[^}]*\}/);
  const escaped = parts.map((part) =>
    part.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`^${escaped.join(".+")}$`);
}

function splitNamespace(key, namespaces, candidates) {
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
export function scanSources(files, rootDirectory, namespaces) {
  const references = [];
  const strings = new Set();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const path = relative(rootDirectory, file);
    const bindings = translationBindings(source);
    // Source ranges already read as `t` arguments, so the literal scan below
    // does not count them twice.
    const consumed = [];

    const record = (index, text, candidates, hasCount, prefix = "") => {
      const literals = literalsIn(text);
      if (literals.length === 0) {
        references.push({
          path,
          line: lineOf(source, index),
          dynamic: text.trim().replaceAll(/\s+/g, " "),
        });
        return;
      }
      for (const literal of literals) {
        // Ternaries also contain unrelated literals, such as comparisons.
        if (
          !literal.template &&
          !/^[\w-]+(:[\w-]+)?(\.[\w-]+)*$/.test(literal.value)
        ) {
          continue;
        }
        if (literal.template && !/^[\w.:${}()?\s-]+$/.test(literal.value)) {
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
        });
      }
    };

    // Wrappers such as `const t = (key) => i18n.t(\`common:dataTable.${key}\`)`
    // prefix every key passed to them.
    const prefixes = new Map();
    for (const match of source.matchAll(
      /const (\w+) = \((\w+)[^)]*\)\s*=>\s*i18n\.t\(`(\w+):([\w.]*)\$\{(\w+)\}`\)/g,
    )) {
      if (match[2] !== match[5]) continue;
      bindings.set(match[1], new Set([match[3]]));
      prefixes.set(match[1], match[4]);
    }

    const calls = [...bindings.keys(), "i18n.t"];
    for (const name of calls) {
      const candidates =
        name === "i18n.t" ? [DEFAULT_NAMESPACE] : [...bindings.get(name)];
      const prefix = prefixes.get(name) ?? "";
      const escaped = name.replace(".", "\\.");
      for (const match of source.matchAll(
        new RegExp(`(?<![\\w$.])${escaped}\\(`, "g"),
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
          /\bcount\b/.test(options),
          prefix,
        );
      }
    }

    for (const match of source.matchAll(/<Trans\b([^>]*?)\/?>/gs)) {
      const attributes = match[1];
      const keyMatch = /i18nKey=(?:\{([^}]*)\}|("[^"]*"))/.exec(attributes);
      if (!keyMatch) continue;
      const translator = /\bt=\{(\w+)\}/.exec(attributes)?.[1];
      const namespace = /\bns=["{]"?(\w+)/.exec(attributes)?.[1];
      const candidates = namespace
        ? [namespace]
        : translator && bindings.has(translator)
          ? [...bindings.get(translator)]
          : [DEFAULT_NAMESPACE];
      record(
        match.index,
        keyMatch[1] ?? keyMatch[2],
        candidates,
        /\bcount\b/.test(attributes),
      );
    }

    // Fully qualified keys can travel through props, schema annotations, and
    // lookup tables before they reach `t`.
    for (const match of source.matchAll(/["'`]((\w+):[\w.-]+)["'`]/g)) {
      strings.add(match[1]);
      if (!namespaces.has(match[2])) continue;
      if (
        consumed.some(
          ([start, end]) => match.index >= start && match.index < end,
        )
      ) {
        continue;
      }
      const resolved = splitNamespace(match[1], namespaces, []);
      references.push({
        path,
        line: lineOf(source, match.index),
        namespaces: resolved.namespaces,
        key: resolved.key,
        template: false,
        hasCount: false,
      });
    }
    for (const match of source.matchAll(/["'`]([\w-]+(?:\.[\w-]+)+)["'`]/g)) {
      strings.add(match[1]);
    }
  }

  return { references, strings };
}

/** Compare source references with the en-US catalogs. */
export function checkTranslationKeys({
  rootDirectory,
  sourceDirectory = join(rootDirectory, "src"),
  localeDirectory = join(rootDirectory, "locales/en-US"),
  dynamicAllowlist = [],
}) {
  const catalogs = loadCatalogs(localeDirectory);
  const namespaces = new Set(catalogs.keys());
  const files = listSourceFiles(sourceDirectory);
  const { references, strings } = scanSources(files, rootDirectory, namespaces);

  const missing = [];
  const missingPlurals = [];
  const usedPatterns = [];
  const usedKeys = new Set();
  const dynamic = [];

  for (const reference of references) {
    if (reference.dynamic) {
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
    if (namespace === undefined) {
      missing.push({
        location,
        key: `${reference.namespaces.join("|")}:${reference.key}`,
      });
      continue;
    }
    usedKeys.add(`${namespace}:${reference.key}`);
    const { leaves } = catalogs.get(namespace);
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
    }
  }

  const unpairedPlurals = [];
  for (const [namespace, { leaves }] of catalogs) {
    for (const key of leaves) {
      if (key.endsWith("_one") && !leaves.has(`${stripPlural(key)}_other`)) {
        unpairedPlurals.push(`${namespace}:${key}`);
      }
    }
  }

  const unused = [];
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
    unused,
    dynamic,
    uncheckedDynamic: dynamic.filter(({ key }) => !allowed.has(key)),
    staleAllowlist: dynamicAllowlist.filter(
      (entry) => !dynamic.some(({ key }) => key === entry),
    ),
  };
}

function print(title, items) {
  process.stdout.write(`${title}: ${items.length}\n`);
  for (const item of items) {
    process.stdout.write(
      typeof item === "string"
        ? `  ${item}\n`
        : `  ${item.location} ${item.key}${item.reason ? ` (${item.reason})` : ""}\n`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDirectory = fileURLToPath(new URL("..", import.meta.url));
  const result = checkTranslationKeys({ rootDirectory });
  print("Missing keys", result.missing);
  print("Plural problems", result.missingPlurals);
  print("Unpaired plural forms", result.unpairedPlurals);
  print("Dynamic keys", result.dynamic);
  print("Unused keys", result.unused);
}

// Matches the default sort order, which compares UTF-16 code units.
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
