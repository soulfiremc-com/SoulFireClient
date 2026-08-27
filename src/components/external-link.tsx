import type {
  AnchorHTMLAttributes,
  DetailedHTMLProps,
  MouseEvent,
} from "react";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import { runAsync } from "@/lib/utils.tsx";

type ExternalLinkProps = Omit<
  DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>,
  "target"
>;

export function ExternalLink({
  href,
  onClick,
  rel,
  ...props
}: ExternalLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    event.stopPropagation();
    if (href && isDesktopApp()) {
      event.preventDefault();
      runAsync(async () => {
        await desktop.shell.openExternal(href);
      });
    }
  };

  return (
    <a
      {...props}
      href={href}
      onClick={handleClick}
      rel={rel ?? "noopener noreferrer"}
      target="_blank"
    />
  );
}
