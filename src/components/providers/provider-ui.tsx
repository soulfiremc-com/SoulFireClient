import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  LoaderIcon,
  MinusIcon,
  PlusIcon,
  ShieldCheckIcon,
  TicketPercentIcon,
  XCircleIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import { ProviderLogo } from "@/components/providers/provider-logo.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  CredenzaDescription,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { Input } from "@/components/ui/input.tsx";
import { RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import type { ResourceProvider } from "@/lib/resource-providers.ts";
import { cn } from "@/lib/utils.tsx";

export type ProviderFlowProps<Result> = {
  provider: ResourceProvider;
  canWrite: boolean;
  onBack?: () => void;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onImport: Result;
};

export function BusyIcon({ busy, icon }: { busy: boolean; icon?: ReactNode }) {
  return busy ? (
    <LoaderIcon data-icon="inline-start" className="animate-spin" />
  ) : (
    icon
  );
}

export function Stepper({
  steps,
  current,
}: {
  steps: { id: string; label: string }[];
  current: string;
}) {
  const { t } = useTranslation("instance");
  const index = steps.findIndex((step) => step.id === current);
  return (
    <ol
      aria-label={t("providers.progress")}
      className="flex items-center gap-1.5"
    >
      {steps.map((step, position) => {
        const done = position < index;
        const active = position === index;
        return (
          <li
            key={step.id}
            aria-current={active ? "step" : undefined}
            className="flex items-center gap-1.5"
          >
            {position > 0 && (
              <span
                aria-hidden
                className={cn(
                  "h-px w-3 md:w-5",
                  done || active ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                active && "bg-primary text-primary-foreground",
                done && "bg-primary/15 text-primary",
                !active && !done && "bg-muted text-muted-foreground",
              )}
            >
              {done ? (
                <CheckIcon aria-hidden className="size-3" />
              ) : (
                position + 1
              )}
            </span>
            <span
              className={cn(
                "text-xs",
                active
                  ? "text-foreground font-medium"
                  : "text-muted-foreground sr-only sm:not-sr-only",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Dialog layout: brand header, step content, side panel and pinned actions. */
export function ProviderFrame({
  providerId,
  title,
  description,
  leading,
  stepper,
  stageKey,
  heading,
  subheading,
  children,
  aside,
  footer,
}: {
  providerId?: string;
  title: string;
  description: string;
  leading?: ReactNode;
  stepper?: ReactNode;
  stageKey?: string;
  heading?: string;
  subheading?: string;
  children: ReactNode;
  aside?: ReactNode;
  footer: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    // Move keyboard and screen reader users to the new step, not on first open.
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [stageKey]);
  return (
    <div
      data-provider={providerId}
      className="flex max-h-[88dvh] min-h-0 w-full flex-col md:h-[min(40rem,88dvh)]"
    >
      <header className="border-border border-t-provider flex flex-col gap-3 border-b border-t-4 p-4 pr-10 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {leading ??
            (providerId && (
              <ProviderLogo providerId={providerId} className="size-11" />
            ))}
          <div className="flex min-w-0 flex-col gap-1">
            <CredenzaTitle>{title}</CredenzaTitle>
            <CredenzaDescription>{description}</CredenzaDescription>
          </div>
        </div>
        {stepper}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:overflow-y-auto">
          {heading && (
            <div className="flex flex-col gap-1">
              <h3
                ref={headingRef}
                tabIndex={-1}
                className="text-base font-semibold outline-none"
              >
                {heading}
              </h3>
              {subheading && (
                <p className="text-muted-foreground text-sm">{subheading}</p>
              )}
            </div>
          )}
          {children}
        </main>
        {aside && (
          <aside className="border-border bg-muted/40 flex shrink-0 flex-col gap-4 border-t p-4 md:w-72 md:overflow-y-auto md:border-t-0 md:border-l">
            {aside}
          </aside>
        )}
      </div>
      <footer className="border-border bg-popover flex flex-wrap items-center justify-between gap-2 border-t p-3">
        {footer}
      </footer>
    </div>
  );
}

export function ChoiceCard({
  value,
  disabled,
  children,
}: {
  value: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "border-border bg-card has-data-checked:border-primary has-data-checked:bg-primary/5 has-focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg border p-3 transition-colors has-focus-visible:ring-3",
        disabled
          ? "cursor-not-allowed opacity-70"
          : "hover:bg-muted/60 cursor-pointer",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <RadioGroupItem value={value} disabled={disabled} />
    </label>
  );
}

export function StatTile({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <div className="border-border bg-card flex items-center gap-2.5 rounded-lg border p-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
          tone === "warning"
            ? "bg-warning/15 text-warning-emphasis"
            : "bg-primary/10 text-primary",
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-foreground/70 text-xs">{label}</span>
        <span className="truncate text-sm font-semibold tabular-nums">
          {value}
        </span>
      </div>
    </div>
  );
}

const noticeTones = {
  info: {
    icon: InfoIcon,
    box: "border-border bg-muted/60",
    color: "text-muted-foreground",
  },
  success: {
    icon: CheckCircle2Icon,
    box: "border-success/40 bg-success/10",
    color: "text-success-emphasis",
  },
  warning: {
    icon: AlertTriangleIcon,
    box: "border-warning/40 bg-warning/10",
    color: "text-warning-emphasis",
  },
  error: {
    icon: XCircleIcon,
    box: "border-destructive/40 bg-destructive/10",
    color: "text-destructive",
  },
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: keyof typeof noticeTones;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const style = noticeTones[tone];
  const Icon = style.icon;
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-lg border p-3 text-sm", style.box)}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.color)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div>{children}</div>}
        {action && <div className="flex flex-wrap gap-2 pt-1">{action}</div>}
      </div>
    </div>
  );
}

export function SummaryRows({
  rows,
}: {
  rows: { id: string; label: string; value: ReactNode; strong?: boolean }[];
}) {
  return (
    <dl className="border-border bg-card divide-border divide-y rounded-lg border">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-baseline justify-between gap-4 px-3 py-2.5"
        >
          <dt className="text-muted-foreground text-sm">{row.label}</dt>
          <dd
            className={cn(
              "min-w-0 text-right tabular-nums select-text",
              row.strong ? "text-lg font-semibold" : "text-sm font-medium",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SecretField({
  label,
  value,
  onChange,
  disabled,
  secret = true,
  placeholder,
  description,
  autoFocus,
}: {
  label: string;
  autoFocus?: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  secret?: boolean;
  placeholder?: string;
  description?: string;
}) {
  const { t } = useTranslation("instance");
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          autoFocus={autoFocus}
          type={secret && !shown ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {secret && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={t(
                shown ? "providers.hideValue" : "providers.showValue",
              )}
              aria-pressed={shown}
              onClick={() => setShown((previous) => !previous)}
            >
              {shown ? <EyeOffIcon /> : <EyeIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

export function QuantityField({
  label,
  value,
  onChange,
  max,
  disabled,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
  disabled?: boolean;
  description?: string;
}) {
  const { t } = useTranslation("instance");
  const id = useId();
  const top = Math.max(1, max);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          aria-label={t("providers.decrease")}
          disabled={disabled || value <= 1}
          onClick={() => onChange(Math.min(top, Math.max(1, value - 1)))}
        >
          <MinusIcon />
        </Button>
        <Input
          id={id}
          type="number"
          min={1}
          max={top}
          value={value}
          disabled={disabled}
          className="w-24 text-center"
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label={t("providers.increase")}
          disabled={disabled || value >= top}
          onClick={() => onChange(Math.max(1, Math.min(top, value + 1)))}
        >
          <PlusIcon />
        </Button>
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

export function CopyValue({ value }: { value: string }) {
  const { t } = useTranslation("instance");
  const copy = useCopyToClipboard();
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={t("providers.copyLabel", { value })}
      onClick={() => copy(value)}
    >
      <CopyIcon data-icon="inline-start" />
      <span className="font-mono">{value}</span>
    </Button>
  );
}

/** Listed offer from the provider listing. The provider sets the final price. */
export function OfferCard({ provider }: { provider: ResourceProvider }) {
  const { t } = useTranslation("instance");
  if (!provider.hasOffer) return null;
  return (
    <section className="border-provider/40 bg-provider/10 flex flex-col gap-2 rounded-lg border p-3">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <TicketPercentIcon aria-hidden className="text-primary size-4" />
        {t("providers.listedOffer")}
      </h4>
      <p className="text-sm">{t(`providers.catalog.${provider.id}.offer`)}</p>
      {provider.coupon && (
        <div>
          <CopyValue value={provider.coupon} />
        </div>
      )}
    </section>
  );
}

export function ShopLink({
  provider,
  label,
  variant = "outline",
  size = "sm",
}: {
  provider: ResourceProvider;
  label: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}) {
  return (
    <Button
      variant={variant}
      size={size}
      nativeButton={false}
      render={<ExternalLink href={provider.url} />}
    >
      <ExternalLinkIcon data-icon="inline-start" />
      {label}
    </Button>
  );
}

/** Side panel shared by every flow: new account path, offer, help and privacy. */
export function FlowAside({
  provider,
  savesKey,
  children,
}: {
  provider: ResourceProvider;
  savesKey?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation("instance");
  return (
    <>
      {children}
      <OfferCard provider={provider} />
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">
          {t("providers.noAccountTitle", { provider: provider.name })}
        </h4>
        <p className="text-foreground/70 text-xs">
          {t("providers.noAccountBody")}
        </p>
        <div className="flex flex-wrap gap-2">
          <ShopLink
            provider={provider}
            label={t("providers.openShop", { provider: provider.name })}
          />
          {provider.docs && (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<ExternalLink href={provider.docs} />}
            >
              {t("providers.connectionHelp")}
            </Button>
          )}
        </div>
      </section>
      <div className="mt-auto flex flex-col gap-2">
        <p className="text-foreground/70 flex gap-2 text-xs">
          <ShieldCheckIcon aria-hidden className="size-4 shrink-0" />
          {t(savesKey ? "providers.keyPrivacySaved" : "providers.keyPrivacy")}
        </p>
        <p className="text-foreground/70 text-xs">
          {t("providers.affiliateDisclosure")}
        </p>
      </div>
    </>
  );
}
