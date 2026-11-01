import { LoaderIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProviderLinks } from "@/components/providers/provider-links.tsx";
import { ProviderSelect } from "@/components/providers/provider-select.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  fetchLocaltsBalance,
  fetchLocaltsOrder,
  fetchLocaltsOrders,
  fetchLocaltsProducts,
  localtsOrderAccounts,
  localtsPrice,
  purchaseLocaltsAccounts,
  type LocaltsImportFormat,
  type LocaltsOrder,
  type LocaltsProduct,
} from "@/lib/localts.ts";
import { ProviderApiError } from "@/lib/provider-request.ts";
import { ACCOUNT_PROVIDERS } from "@/lib/resource-providers.ts";

export default function LocaltsDialog({
  onClose,
  onImport,
  canPurchase,
}: {
  onClose: () => void;
  onImport: (payload: string[], type: AccountTypeCredentials) => void;
  canPurchase: boolean;
}) {
  const { t } = useTranslation("instance");
  const formId = useId();
  const [key, setKey] = useState("");
  const [products, setProducts] = useState<LocaltsProduct[] | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState(1);
  const [format, setFormat] = useState("");
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<LocaltsOrder | null>(null);
  const [orders, setOrders] = useState<{ id: string; productId: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseUncertain, setPurchaseUncertain] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const product = products?.find((entry) => entry.id === selected);
  const validAmount = Number.isInteger(amount) && amount > 0 && amount <= 1_000;
  const total = product && validAmount ? localtsPrice(product, amount) : null;

  useEffect(() => {
    const request = new AbortController();
    void fetchLocaltsProducts(request.signal)
      .then((result) => {
        if (!request.signal.aborted) setProducts(result);
      })
      .catch(() => {
        if (!request.signal.aborted) setError(t("providers.errors.network"));
      })
      .finally(() => {
        if (!request.signal.aborted) setLoadingProducts(false);
      });
    return () => {
      request.abort();
    };
  }, [t]);
  useEffect(() => () => controller.current?.abort(), []);

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    try {
      await task(request.signal);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof ProviderApiError
            ? t(
                cause.reason === "limit"
                  ? "providers.localts.quantityHelp"
                  : `providers.errors.${cause.reason}`,
              )
            : t("providers.errors.network"),
        );
    } finally {
      controller.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return (
    <Credenza
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("providers.localts.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("providers.localts.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="max-h-[65vh] overflow-y-auto">
          <FieldGroup>
            <ProviderLinks
              provider={ACCOUNT_PROVIDERS.find(
                (entry) => entry.id === "localts",
              )!}
            />
            <Field>
              <FieldLabel htmlFor={`${formId}-key`}>
                {t("providers.fields.apiKey")}
              </FieldLabel>
              <Input
                id={`${formId}-key`}
                type="password"
                autoComplete="off"
                value={key}
                disabled={busy}
                onChange={(event) => {
                  setKey(event.target.value);
                  setBalance(null);
                  setOrders([]);
                  setOrder(null);
                }}
              />
            </Field>
            <Button
              variant="outline"
              disabled={busy || !key.trim()}
              onClick={() =>
                void run(async (signal) => {
                  const [credits, latest] = await Promise.all([
                    fetchLocaltsBalance(key, signal),
                    fetchLocaltsOrders(key, signal),
                  ]);
                  signal.throwIfAborted();
                  setBalance(credits);
                  setOrders(latest);
                })
              }
            >
              {busy && (
                <LoaderIcon data-icon="inline-start" className="animate-spin" />
              )}
              {t("providers.localts.connect")}
            </Button>
            {balance !== null && (
              <FieldDescription>
                {t("providers.localts.balance", { balance })}
              </FieldDescription>
            )}
            {loadingProducts ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <ProviderSelect
                label={t("providers.product")}
                value={selected}
                items={(products ?? []).map((entry) => ({
                  value: entry.id,
                  label: `${entry.name} (${entry.stock})`,
                }))}
                onChange={setSelected}
                disabled={busy || !products?.length}
              />
            )}
            <Field>
              <FieldLabel htmlFor={`${formId}-amount`}>
                {t("providers.quantity")}
              </FieldLabel>
              <Input
                id={`${formId}-amount`}
                type="number"
                min={1}
                max={Math.min(1_000, product?.stock ?? 1_000)}
                value={amount}
                disabled={busy}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </Field>
            {total !== null && (
              <FieldDescription>
                {t("providers.localts.total", { total })}
              </FieldDescription>
            )}
            <Button
              disabled={
                busy ||
                !canPurchase ||
                !product ||
                total === null ||
                balance === null ||
                balance < total ||
                amount > product.stock ||
                purchased ||
                purchaseUncertain
              }
              onClick={() =>
                void run(async (signal) => {
                  if (!product || total === null) return;
                  try {
                    const id = await purchaseLocaltsAccounts(
                      key,
                      product,
                      amount,
                      total,
                      signal,
                    );
                    setOrderId(id);
                    setOrders((previous) => [
                      { id, productId: product.id },
                      ...previous.filter((entry) => entry.id !== id),
                    ]);
                    setOrder(null);
                    setPurchased(true);
                    setBalance(null);
                  } catch (cause) {
                    if (
                      !(cause instanceof ProviderApiError) ||
                      cause.reason === "network" ||
                      cause.reason === "response"
                    )
                      setPurchaseUncertain(true);
                    throw cause;
                  }
                })
              }
            >
              {t("providers.localts.purchase", { total: total ?? 0 })}
            </Button>
            {purchased && (
              <FieldDescription>
                {t("providers.localts.purchased", { orderId })}
              </FieldDescription>
            )}
            {purchaseUncertain && (
              <Alert>
                <AlertDescription>
                  {t("providers.purchaseUncertain")}
                </AlertDescription>
              </Alert>
            )}
            {orders.length > 0 && (
              <ProviderSelect
                label={t("providers.localts.recentOrders")}
                value={orderId}
                items={orders.map((entry) => ({
                  value: entry.id,
                  label: `${products?.find((item) => item.id === entry.productId)?.name ?? entry.productId} (${entry.id})`,
                }))}
                onChange={(id) => {
                  setOrderId(id);
                  setOrder(null);
                }}
                disabled={busy}
              />
            )}
            <Field>
              <FieldLabel htmlFor={`${formId}-order`}>
                {t("providers.localts.orderId")}
              </FieldLabel>
              <Input
                id={`${formId}-order`}
                value={orderId}
                disabled={busy}
                onChange={(event) => {
                  setOrderId(event.target.value);
                  setOrder(null);
                }}
              />
            </Field>
            <Button
              variant="outline"
              disabled={busy || !key.trim() || !orderId.trim()}
              onClick={() =>
                void run(async (signal) => {
                  const result = await fetchLocaltsOrder(
                    key,
                    orderId.trim(),
                    signal,
                  );
                  signal.throwIfAborted();
                  setOrder(result);
                })
              }
            >
              {t("providers.localts.loadOrder")}
            </Button>
            {order && (
              <FieldDescription>
                {t("providers.localts.orderStatus", {
                  status: order["order-status"],
                  count: order.items?.length ?? 0,
                })}
              </FieldDescription>
            )}
            <ProviderSelect
              label={t("providers.localts.importFormat")}
              value={format}
              items={[
                {
                  value: "cookies",
                  label: t("providers.localts.cookieTokens"),
                },
                {
                  value: "credentials",
                  label: t("account.import.microsoftCredentials"),
                },
                {
                  value: "refresh-token",
                  label: t("account.import.microsoftRefreshToken"),
                },
                {
                  value: "access-token",
                  label: t("account.import.microsoftAccessToken"),
                },
              ]}
              onChange={setFormat}
              disabled={busy}
            />
            <FieldDescription>
              {t("providers.localts.formatHelp")}
            </FieldDescription>
            <Button
              disabled={
                busy ||
                !canPurchase ||
                !format ||
                !order?.items?.length ||
                order.status !== "PACKAGED" ||
                !["COMPLETE", "PARTIALLY_REFUNDED"].includes(
                  order["order-status"],
                )
              }
              onClick={() => {
                if (!order || !format) return;
                try {
                  const accounts = localtsOrderAccounts(
                    order,
                    format as LocaltsImportFormat,
                  );
                  onImport(accounts.payload, accounts.credentialType);
                  onClose();
                } catch {
                  setError(t("providers.errors.response"));
                }
              }}
            >
              {t("providers.localts.importAccounts")}
            </Button>
            {error && (
              <Alert>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FieldDescription>{t("providers.keyPrivacy")}</FieldDescription>
          </FieldGroup>
        </CredenzaBody>
        <CredenzaFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common:close")}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
