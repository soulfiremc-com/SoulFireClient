import { cn } from "@/lib/utils.tsx";

const FALLBACK_SKIN = "MHF_Steve";

/// Builds a mc-heads.net avatar URL for a skin texture hash, falling back to
/// the default Steve head when no skin is available.
export function getMinecraftHeadUrl(
  skinTextureHash: string | undefined,
  size: number,
): string {
  const resolution = Math.min(512, Math.max(64, Math.round(size * 2)));
  return `https://mc-heads.net/head/${skinTextureHash ?? FALLBACK_SKIN}/${resolution}`;
}

/// Renders a Minecraft player head from a skin texture hash.
export function MinecraftHead({
  skinTextureHash,
  size = 48,
  name,
  className,
}: {
  skinTextureHash?: string;
  size?: number;
  name?: string;
  className?: string;
}) {
  return (
    <img
      src={getMinecraftHeadUrl(skinTextureHash, size)}
      alt={name ?? "Minecraft head"}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded", className)}
      loading="lazy"
    />
  );
}
