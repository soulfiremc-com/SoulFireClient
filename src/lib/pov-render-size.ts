// Keep the viewport's aspect ratio within the POV RPC's dimension limits.
export function povRenderSize(
  width: number,
  height: number,
  pixelRatio: number,
): { width: number; height: number } | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(pixelRatio) ||
    width <= 0 ||
    height <= 0 ||
    pixelRatio <= 0
  ) {
    return null;
  }

  const scale = Math.min(pixelRatio, 1920 / width, 1080 / height);
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}
