import {
  ArrowRightIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  LaptopMinimalIcon,
  type LucideIcon,
  MonitorDownIcon,
  PickaxeIcon,
  ServerIcon,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { getAppUrl } from "@/lib/app-deployment.ts";
import { cn } from "@/lib/utils.tsx";

/** Shows where the Soulfire server sits between this app and Minecraft. */
function ConnectionPath() {
  const { t } = useTranslation("login");
  const stops = [
    { id: "app", icon: LaptopMinimalIcon, label: t("connect.path.app") },
    { id: "server", icon: ServerIcon, label: t("connect.path.server") },
    { id: "minecraft", icon: PickaxeIcon, label: t("connect.path.minecraft") },
  ];
  return (
    <ol
      aria-label={t("connect.path.label")}
      className="bg-muted/50 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs"
    >
      {stops.map((stop, index) => (
        <li key={stop.id} className="flex items-center gap-2">
          {index > 0 && (
            <ChevronRightIcon
              aria-hidden="true"
              className="text-muted-foreground size-3.5"
            />
          )}
          <stop.icon aria-hidden="true" className="size-3.5" />
          <span className={cn(stop.id === "server" && "font-medium")}>
            {stop.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ChoiceButton(props: {
  autoFocus?: boolean;
  disabled?: boolean;
  recommended?: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation("login");
  const Icon = props.icon;
  return (
    <div role="listitem">
      <Item
        render={
          <button
            type="button"
            autoFocus={props.autoFocus}
            disabled={props.disabled}
            onClick={props.onSelect}
          />
        }
        variant="outline"
        className="w-full cursor-pointer rounded-lg text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            {props.title}
            {props.recommended && (
              <Badge variant="secondary">{t("connect.recommended")}</Badge>
            )}
          </ItemTitle>
          <ItemDescription className="line-clamp-none">
            {props.description}
          </ItemDescription>
        </ItemContent>
        {!props.disabled && (
          <ChevronRightIcon
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
        )}
      </Item>
    </div>
  );
}

/** The first decision: where the Soulfire server runs. */
export function ConnectionChoices(props: {
  demoMode: boolean;
  canRunLocally: boolean;
  isDesktop: boolean;
  savedServer: { address: string | null } | null;
  onContinueSaved: () => void;
  onEnterDemo: () => void;
  onRunLocally: () => void;
  onConnectExisting: () => void;
}) {
  const { t } = useTranslation("login");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("connect.title")}</CardTitle>
        <CardDescription>{t("connect.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ConnectionPath />
        {props.savedServer && (
          <Button
            variant="secondary"
            className="w-full justify-between"
            onClick={props.onContinueSaved}
          >
            <span className="truncate">
              {props.savedServer.address
                ? t("connect.saved.withAddress", {
                    address: props.savedServer.address,
                  })
                : t("connect.saved.title")}
            </span>
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        )}
        <ItemGroup className="gap-3">
          {props.demoMode && (
            <ChoiceButton
              autoFocus
              icon={FlaskConicalIcon}
              title={t("connect.demo.title")}
              description={t("connect.demo.description")}
              onSelect={props.onEnterDemo}
            />
          )}
          <ChoiceButton
            autoFocus={props.canRunLocally}
            disabled={!props.canRunLocally}
            recommended={props.canRunLocally}
            icon={LaptopMinimalIcon}
            title={t("connect.integrated.title")}
            description={
              props.canRunLocally || props.demoMode
                ? t("connect.integrated.description")
                : t("connect.integrated.webDescription")
            }
            onSelect={props.onRunLocally}
          />
          <ChoiceButton
            autoFocus={!props.canRunLocally && !props.demoMode}
            disabled={props.demoMode}
            icon={ServerIcon}
            title={t("connect.dedicated.title")}
            description={t("connect.dedicated.description")}
            onSelect={props.onConnectExisting}
          />
          {!props.demoMode && (
            <div role="listitem">
              <Item
                variant="outline"
                className="hover:bg-muted rounded-lg"
                render={
                  <ExternalLink
                    href={`${getAppUrl(APP_ENVIRONMENT, true)}?utm_source=soulfire-client&utm_medium=app&utm_campaign=login-demo`}
                  />
                }
              >
                <ItemMedia variant="icon">
                  <FlaskConicalIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t("connect.demo.title")}</ItemTitle>
                  <ItemDescription className="line-clamp-none">
                    {t("connect.demo.linkDescription")}
                  </ItemDescription>
                </ItemContent>
                <ExternalLinkIcon
                  aria-hidden="true"
                  className="text-muted-foreground size-4"
                />
              </Item>
            </div>
          )}
        </ItemGroup>
        {!props.isDesktop && !props.demoMode && (
          <p className="text-muted-foreground flex items-start gap-2 text-sm">
            <MonitorDownIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              <Trans
                i18nKey="login:connect.integrated.getDesktop"
                components={{
                  a: (
                    <ExternalLink
                      href="https://soulfiremc.com/docs/installation?utm_source=soulfire-client&utm_medium=app&utm_campaign=login-desktop"
                      className="underline underline-offset-3"
                    />
                  ),
                }}
              />
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
