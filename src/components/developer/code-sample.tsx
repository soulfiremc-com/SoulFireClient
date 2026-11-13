import { ClipboardIcon } from "lucide-react";
import { type CSSProperties, Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import type { CodeLanguage, highlightCode } from "@/lib/code-highlighter.ts";

type Highlighted = Awaited<ReturnType<typeof highlightCode>>;

export function CodeSample({
  title,
  code,
  language,
  copyLabel,
  disabled = false,
}: {
  title: string;
  code: string;
  language: CodeLanguage;
  copyLabel: string;
  disabled?: boolean;
}) {
  const copy = useCopyToClipboard({ sensitive: true });
  const [highlighted, setHighlighted] = useState<{
    code: string;
    language: CodeLanguage;
    lines: Highlighted;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void import("@/lib/code-highlighter.ts")
      .then(({ highlightCode }) => highlightCode(code, language))
      .then((lines) => {
        if (active) setHighlighted({ code, language, lines });
      })
      .catch(() => {
        // Keep the readable, copyable plain-text sample if highlighting fails.
      });
    return () => {
      active = false;
    };
  }, [code, language]);

  const lines =
    highlighted?.code === code && highlighted.language === language
      ? highlighted.lines
      : null;

  return (
    <figure
      data-slot="sdk-code-sample"
      className="min-w-0 overflow-hidden rounded-lg border"
    >
      <figcaption className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <span className="truncate font-mono text-xs">{title}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => copy(code)}
        >
          <ClipboardIcon data-icon="inline-start" />
          {copyLabel}
        </Button>
      </figcaption>
      <pre
        className="overflow-x-auto bg-muted/40 p-4 text-xs leading-relaxed"
        tabIndex={0}
        aria-label={title}
        data-language={language}
        data-highlighted={lines ? "true" : undefined}
      >
        <code>
          {lines
            ? lines.map((line) => (
                <Fragment key={line.offset}>
                  {line.tokens.map((token) => (
                    <span
                      key={token.offset}
                      data-syntax-token
                      style={
                        {
                          "--syntax-light": token.variants.light.color,
                          "--syntax-dark": token.variants.dark.color,
                        } as CSSProperties
                      }
                    >
                      {token.content}
                    </span>
                  ))}
                  {line.newline}
                </Fragment>
              ))
            : code}
        </code>
      </pre>
    </figure>
  );
}
