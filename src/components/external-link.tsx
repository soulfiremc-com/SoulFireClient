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
    // oxlint-disable-next-line jsx-a11y/anchor-has-content -- the link text arrives through the spread props
    <a
      {...props}
      href={href}
      onClick={handleClick}
      rel={rel ?? "noopener noreferrer"}
      // oxlint-disable-next-line react/jsx-no-target-blank -- rel defaults to "noopener noreferrer", and no caller overrides it
      target="_blank"
    />
  );
}
