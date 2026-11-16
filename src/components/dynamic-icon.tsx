import type { LucideProps } from "lucide-react";
import type dynamicIconImports from "lucide-react/dynamicIconImports";
import React, { Suspense } from "react";

export type LucideIconName = keyof typeof dynamicIconImports;

export interface IconProps extends Omit<LucideProps, "ref"> {
  name: string;
}

const cache = new Map<
  string,
  React.LazyExoticComponent<React.ComponentType<LucideProps>>
>();

const FALLBACK_ICON: LucideIconName = "settings";

// The import map lists every Lucide icon, so load it on first use instead of
// keeping it in the startup bundle.
function loadIcon(name: string) {
  return import("lucide-react/dynamicIconImports").then(({ default: icons }) =>
    name in icons ? icons[name as LucideIconName]() : icons[FALLBACK_ICON](),
  );
}

function loadCachedIcon(name: string) {
  const value = cache.get(name);
  if (value !== undefined) {
    return value;
  }

  const lazyValue = React.lazy(() => loadIcon(name));
  cache.set(name, lazyValue);
  return lazyValue;
}

const DynamicIcon = React.memo(({ name, ...props }: IconProps) => {
  const LazyIcon = loadCachedIcon(name);

  return (
    <Suspense fallback={<div className={props.className} />}>
      <LazyIcon {...props} />
    </Suspense>
  );
});

export default DynamicIcon;
