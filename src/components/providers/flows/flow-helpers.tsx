import { useTranslation } from "react-i18next";
import { ProviderApiError } from "@/lib/provider-request.ts";

/** Network and malformed responses can follow an accepted purchase. */
export function isUncertainPurchase(cause: unknown): boolean {
  return (
    !(cause instanceof ProviderApiError) ||
    cause.reason === "network" ||
    cause.reason === "response"
  );
}

export function useAmountFormat() {
  const { i18n } = useTranslation();
  return (value: number) =>
    value.toLocaleString(i18n.language, { maximumFractionDigits: 8 });
}

export function subtractAmount(balance: number, total: number): number {
  return Number((balance - total).toFixed(8));
}
