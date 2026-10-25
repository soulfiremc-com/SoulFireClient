export function getCommandSuggestionsPosition(
  anchor: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
) {
  const gap = 8;
  const gutter = 8;
  const width = Math.min(256, Math.max(0, viewport.width - gutter * 2));
  const spaceBelow = Math.max(
    0,
    viewport.height - anchor.bottom - gap - gutter,
  );
  const spaceAbove = Math.max(0, anchor.top - gap - gutter);
  const above = spaceBelow < Math.min(240, spaceAbove);
  return {
    left: Math.min(
      Math.max(anchor.left, gutter),
      Math.max(gutter, viewport.width - gutter - width),
    ),
    top: above ? anchor.top - gap : anchor.bottom + gap,
    width,
    maxHeight: Math.min(240, above ? spaceAbove : spaceBelow),
    above,
  };
}
