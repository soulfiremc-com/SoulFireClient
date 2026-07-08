import type { i18n } from "i18next";
import {
  CookieIcon,
  KeyRoundIcon,
  type LucideIcon,
  MonitorSmartphoneIcon,
  RotateCcwKeyIcon,
  TicketIcon,
  WifiOffIcon,
} from "lucide-react";
import type { MinecraftAccountProto_AccountTypeProto } from "@/generated/soulfire/common_pb.ts";

export type MinecraftAccountTypeKey =
  keyof typeof MinecraftAccountProto_AccountTypeProto;

const accountTypeIcons = {
  OFFLINE: WifiOffIcon,
  MICROSOFT_JAVA_CREDENTIALS: KeyRoundIcon,
  MICROSOFT_JAVA_DEVICE_CODE: MonitorSmartphoneIcon,
  MICROSOFT_JAVA_REFRESH_TOKEN: RotateCcwKeyIcon,
  MICROSOFT_JAVA_COOKIES: CookieIcon,
  MICROSOFT_JAVA_ACCESS_TOKEN: TicketIcon,
  THE_ALTENING: TicketIcon,
  MICROSOFT_BEDROCK_CREDENTIALS: KeyRoundIcon,
  MICROSOFT_BEDROCK_DEVICE_CODE: MonitorSmartphoneIcon,
} satisfies Record<MinecraftAccountTypeKey, LucideIcon>;

export function accountTypeToIcon(type: MinecraftAccountTypeKey): LucideIcon {
  return accountTypeIcons[type];
}

export function translateAccountType(
  i18nInstance: i18n,
  type: MinecraftAccountTypeKey,
): string {
  return i18nInstance.t(`instance:account.types.${type}`);
}
