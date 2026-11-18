const APP_TITLE = "SoulFire";

type RouteTitleMatch = {
  context: unknown;
  loaderData?: unknown;
  params: Record<string, string>;
};

export type RouteTitleResolver = (
  match: RouteTitleMatch,
) => null | string | undefined;
export type RouteIcon =
  | {
      kind: "dynamic";
      name: string;
    }
  | {
      kind: "logo";
      src: string;
      alt: string;
    };
export type RouteIconResolver = (
  match: RouteTitleMatch,
) => null | RouteIcon | undefined;

const SOULFIRE_LOGO_ICON: RouteIcon = {
  kind: "logo",
  src: "/logo.png",
  alt: "SoulFire logo",
};

/** Reads a string field from the loader data of a route match. */
export function loaderDataString(
  match: RouteTitleMatch,
  key: string,
): string | undefined {
  const loaderData = match.loaderData;
  if (typeof loaderData !== "object" || loaderData === null) return undefined;
  const value: unknown = Reflect.get(loaderData, key);
  return typeof value === "string" ? value : undefined;
}

function contextResolver(
  context: unknown,
  key: "getIcon" | "getTitle",
): ((match: RouteTitleMatch) => unknown) | undefined {
  if (typeof context !== "object" || context === null) return undefined;
  const resolver: unknown = Reflect.get(context, key);
  return typeof resolver === "function"
    ? (match) => Reflect.apply(resolver, undefined, [match])
    : undefined;
}

function isRouteIcon(value: unknown): value is RouteIcon {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value.kind === "dynamic" || value.kind === "logo")
  );
}

export function buildDocumentTitle(pageTitle?: null | string) {
  const normalizedTitle = pageTitle?.trim();

  if (!normalizedTitle || normalizedTitle === APP_TITLE) {
    return APP_TITLE;
  }

  return `${normalizedTitle} | ${APP_TITLE}`;
}

export function routeTitle(getTitle: RouteTitleResolver) {
  return { getTitle };
}

export function routeIcon(getIcon: RouteIconResolver) {
  return { getIcon };
}

export function staticRouteTitle(title: (() => string) | string) {
  return routeTitle(() => (typeof title === "function" ? title() : title));
}

export function staticRouteIcon(icon: (() => RouteIcon) | RouteIcon) {
  return routeIcon(() => (typeof icon === "function" ? icon() : icon));
}

export function staticRouteChrome(
  title: (() => string) | string,
  icon: (() => RouteIcon) | RouteIcon,
) {
  return {
    ...staticRouteTitle(title),
    ...staticRouteIcon(icon),
  };
}

export function routeChrome(config: {
  getTitle?: RouteTitleResolver;
  getIcon?: RouteIconResolver;
}) {
  return {
    ...(config.getTitle ? routeTitle(config.getTitle) : {}),
    ...(config.getIcon ? routeIcon(config.getIcon) : {}),
  };
}

export function resolveRouteTitle(
  matches: Array<{
    context: unknown;
    loaderData?: unknown;
    params: Record<string, string>;
  }>,
) {
  for (const match of matches.toReversed()) {
    const getTitle = contextResolver(match.context, "getTitle");

    if (getTitle === undefined) {
      continue;
    }

    const resolvedTitle = getTitle(match);
    if (typeof resolvedTitle === "string" && resolvedTitle.trim()) {
      return resolvedTitle.trim();
    }
  }

  return APP_TITLE;
}

export function resolveRouteIcon(
  matches: Array<{
    context: unknown;
    loaderData?: unknown;
    params: Record<string, string>;
  }>,
  pageTitle: string,
) {
  for (const match of matches.toReversed()) {
    const getIcon = contextResolver(match.context, "getIcon");

    if (getIcon === undefined) {
      continue;
    }

    const resolvedIcon = getIcon(match);
    if (isRouteIcon(resolvedIcon)) {
      return resolvedIcon;
    }
  }

  if (pageTitle === APP_TITLE) {
    return SOULFIRE_LOGO_ICON;
  }

  return null;
}

export { APP_TITLE, SOULFIRE_LOGO_ICON };
