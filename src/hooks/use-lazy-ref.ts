import * as React from "react";

function useLazyRef<T>(fn: () => T) {
  const ref = React.useRef<T | null>(null);

  ref.current ??= fn();

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the ref is filled before it is returned
  return ref as React.RefObject<T>;
}

export { useLazyRef };
