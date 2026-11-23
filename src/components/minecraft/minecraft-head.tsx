import { useTranslation } from "react-i18next";
import { minecraftAvatarUrl } from "@/lib/minecraft-avatar.ts";
import { cn } from "@/lib/utils.tsx";

/// Renders a Minecraft player head from a skin texture hash.
export function MinecraftHead({
  skinTextureHash,
  size = 48,
  name,
  className,
}: {
  skinTextureHash?: string | undefined;
  size?: number;
  name?: string;
  className?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <img
      src={minecraftAvatarUrl(
        "head",
        skinTextureHash,
        Math.min(512, Math.max(64, Math.round(size * 2))),
      )}
      alt={name ?? t("minecraftHead")}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-sm", className)}
      loading="lazy"
    />
  );
}
