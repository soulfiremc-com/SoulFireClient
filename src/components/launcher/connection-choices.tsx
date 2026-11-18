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
import { useTranslation } from "react-i18next";
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

/** Shows where the SoulFire server sits between this app and Minecraft. */
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
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/50 px-3 py-2 text-xs"
    >
      {stops.map((stop, index) => (
        <li key={stop.id} className="flex items-center gap-2">
          {index > 0 && (
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
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
            className="size-4 text-muted-foreground"
          />
        )}
      </Item>
    </div>
  );
}

function LinkChoice(props: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  const Icon = props.icon;
  return (
    <div role="listitem">
      <Item
        variant="outline"
        className="rounded-lg hover:bg-muted"
        render={<ExternalLink href={props.href} />}
      >
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{props.title}</ItemTitle>
          <ItemDescription className="line-clamp-none">
            {props.description}
          </ItemDescription>
        </ItemContent>
        <ExternalLinkIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
      </Item>
    </div>
  );
}

/** The first decision: where the SoulFire server runs. */
export function ConnectionChoices(props: {
  demoMode: boolean;
  canRunLocally: boolean;
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
          {props.canRunLocally || props.demoMode ? (
            <ChoiceButton
              autoFocus={props.canRunLocally}
              disabled={!props.canRunLocally}
              recommended={props.canRunLocally}
              icon={LaptopMinimalIcon}
              title={t("connect.integrated.title")}
              description={t("connect.integrated.description")}
              onSelect={props.onRunLocally}
            />
          ) : (
            // A browser cannot start a local server, so link to the desktop
            // app instead of showing a disabled choice.
            <LinkChoice
              href="https://soulfiremc.com/docs/installation?utm_source=soulfire-client&utm_medium=app&utm_campaign=login-desktop"
              icon={MonitorDownIcon}
              title={t("connect.integrated.title")}
              description={t("connect.integrated.webDescription")}
            />
          )}
          <ChoiceButton
            autoFocus={!props.canRunLocally && !props.demoMode}
            disabled={props.demoMode}
            icon={ServerIcon}
            title={t("connect.dedicated.title")}
            description={t("connect.dedicated.description")}
            onSelect={props.onConnectExisting}
          />
          {!props.demoMode && (
            <LinkChoice
              href={`${getAppUrl(APP_ENVIRONMENT, true)}?utm_source=soulfire-client&utm_medium=app&utm_campaign=login-demo`}
              icon={FlaskConicalIcon}
              title={t("connect.demo.title")}
              description={t("connect.demo.linkDescription")}
            />
          )}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
