import type { LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty.tsx";

/** A titled section of the bot page. */
export function BotPanel({
  icon: Icon,
  title,
  actions,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id={headingId}
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Icon className="size-4" />
          {title}
        </h3>
        {actions && (
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </section>
  );
}

/** Says why a panel has nothing to show, such as an offline bot. */
export function BotPanelEmpty({ children }: { children: ReactNode }) {
  return (
    <Empty className="border p-6">
      <EmptyHeader>
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- EmptyDescription renders a div, and the status role announces state changes */}
        <EmptyDescription role="status">{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
