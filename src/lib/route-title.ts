const APP_TITLE = "Soulfire";

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
  alt: "Soulfire logo",
};

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
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const getTitle = (match.context as { getTitle?: unknown }).getTitle;

    if (typeof getTitle !== "function") {
      continue;
    }

    const resolvedTitle = (getTitle as RouteTitleResolver)(match);
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
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const getIcon = (match.context as { getIcon?: unknown }).getIcon;

    if (typeof getIcon !== "function") {
      continue;
    }

    const resolvedIcon = (getIcon as RouteIconResolver)(match);
    if (resolvedIcon) {
      return resolvedIcon;
    }
  }

  if (pageTitle === APP_TITLE) {
    return SOULFIRE_LOGO_ICON;
  }

  return null;
}

export { APP_TITLE, SOULFIRE_LOGO_ICON };
