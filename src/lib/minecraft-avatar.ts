const FALLBACK_SKIN = "MHF_Steve";

/**
 * Builds a mc-heads.net image URL for a skin texture hash. Bots without a
 * known skin show the default Steve skin.
 */
export function minecraftAvatarUrl(
  view: "head" | "body",
  skinTextureHash: string | undefined,
  resolution?: number,
): string {
  const skin = skinTextureHash || FALLBACK_SKIN;
  const base = `https://mc-heads.net/${view}/${skin}`;
  return resolution === undefined ? base : `${base}/${resolution}`;
}
