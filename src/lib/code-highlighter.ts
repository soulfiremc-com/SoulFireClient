import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export type CodeLanguage =
  | "typescript"
  | "python"
  | "shellscript"
  | "powershell";

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    themes: [
      import("shiki/themes/github-light-high-contrast.mjs"),
      import("shiki/themes/github-dark-high-contrast.mjs"),
    ],
    langs: [
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/python.mjs"),
      import("shiki/langs/shellscript.mjs"),
      import("shiki/langs/powershell.mjs"),
    ],
  });
  return highlighter;
}

export async function highlightCode(code: string, language: CodeLanguage) {
  const engine = await getHighlighter();
  const lines = engine.codeToTokensWithThemes(code, {
    lang: language,
    themes: {
      light: "github-light-high-contrast",
      dark: "github-dark-high-contrast",
    },
  });
  const sourceLines = code.split(/(\r?\n)/);
  let offset = 0;
  return lines.map((tokens, index) => {
    const start = offset;
    const newline = sourceLines[index * 2 + 1] ?? "";
    offset += (sourceLines[index * 2]?.length ?? 0) + newline.length;
    return { offset: start, tokens, newline };
  });
}
