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
import type { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import {
  fetchFernanAccount,
  fetchFernanPurchase,
  fernanPurchaseAccounts,
  fernanPurchaseLimit,
  purchaseFernanAccounts,
  type FernanAccount,
  type FernanImportFormat,
  type FernanPurchase,
} from "@/lib/fernan.ts";
import { ProviderApiError } from "@/lib/provider-request.ts";
import { ACCOUNT_PROVIDERS } from "@/lib/resource-providers.ts";

export default function FernanDialog({
  onClose,
  onImport,
  canPurchase,
}: {
  onClose: () => void;
  onImport: (payload: string[], type: AccountTypeCredentials) => void;
  canPurchase: boolean;
}) {
  const { t } = useTranslation("instance");
  const id = useId();
  const provider = ACCOUNT_PROVIDERS.find((entry) => entry.id === "fernan")!;
  const [key, setKey] = useState("");
  const [account, setAccount] = useState<FernanAccount | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState(1);
  const [referral, setReferral] = useState(provider.coupon ?? "");
  const [purchaseId, setPurchaseId] = useState("");
  const [purchase, setPurchase] = useState<FernanPurchase | null>(null);
  const [format, setFormat] = useState<FernanImportFormat>("access-token");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const product = account?.stock.find(
    (entry) => String(entry.product_id) === selected,
  );
  const limit =
    product && account ? fernanPurchaseLimit(product, account.cooldowns) : 0;
  const total =
    product && Number.isInteger(amount) && amount > 0
      ? product.price * amount
      : null;

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
            ? t(`providers.errors.${cause.reason}`)
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
          <CredenzaTitle>{t("providers.fernan.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("providers.fernan.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="max-h-[65vh] overflow-y-auto">
          <FieldGroup>
            <ProviderLinks provider={provider} />
            <Field>
              <FieldLabel htmlFor={`${id}-key`}>
                {t("providers.fields.apiKey")}
              </FieldLabel>
              <Input
                id={`${id}-key`}
                type="password"
                autoComplete="off"
                disabled={busy}
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                  setAccount(null);
                  setBalance(null);
                  setPurchase(null);
                }}
              />
            </Field>
            <Button
              variant="outline"
              disabled={busy || !key.trim()}
              onClick={() =>
                void run(async (signal) => {
                  const result = await fetchFernanAccount(key, signal);
                  signal.throwIfAborted();
                  setAccount(result);
                  setBalance(result.balance);
                })
              }
            >
              {t("providers.localts.connect")}
            </Button>
            {balance !== null && (
              <FieldDescription>
                {t("providers.fernan.balance", { balance })}
              </FieldDescription>
            )}
            <ProviderSelect
              label={t("providers.product")}
              value={selected}
              items={(account?.stock ?? []).map((entry) => ({
                value: String(entry.product_id),
                label: `${entry.product_name} (${entry.count})`,
              }))}
              onChange={setSelected}
              disabled={busy || !account?.stock.length}
            />
            <Field>
              <FieldLabel htmlFor={`${id}-amount`}>
                {t("providers.quantity")}
              </FieldLabel>
              <Input
                id={`${id}-amount`}
                type="number"
                min={1}
                max={Math.max(1, limit)}
                value={amount}
                disabled={busy}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              {product && (
                <FieldDescription>
                  {t("providers.fernan.limit", { count: limit })}
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-referral`}>
                {t("providers.coupon")}
              </FieldLabel>
              <Input
                id={`${id}-referral`}
                maxLength={16}
                value={referral}
                disabled={busy}
                onChange={(event) => setReferral(event.target.value)}
              />
            </Field>
            {total !== null && (
              <FieldDescription>
                {t("providers.fernan.total", { total })}
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
                !Number.isInteger(amount) ||
                amount < 1 ||
                amount > limit ||
                (referral !== "" && !/^[a-z\d]{3,16}$/i.test(referral)) ||
                purchased ||
                uncertain
              }
              onClick={() =>
                void run(async (signal) => {
                  if (!product || total === null) return;
                  try {
                    const result = await purchaseFernanAccounts(
                      key,
                      product,
                      amount,
                      total,
                      referral,
                      signal,
                    );
                    setPurchase(result);
                    setPurchaseId(result.purchase_id);
                    setAccount(
                      (previous) =>
                        previous && {
                          ...previous,
                          purchases: [
                            {
                              purchase_id: result.purchase_id,
                              product_name: product.product_name,
                            },
                            ...previous.purchases.filter(
                              (entry) =>
                                entry.purchase_id !== result.purchase_id,
                            ),
                          ],
                        },
                    );
                    setPurchased(true);
                    setBalance(result.balance_after ?? null);
                  } catch (cause) {
                    if (
                      !(cause instanceof ProviderApiError) ||
                      cause.reason === "network" ||
                      cause.reason === "response"
                    )
                      setUncertain(true);
                    throw cause;
                  }
                })
              }
            >
              {t("providers.fernan.purchase", { count: amount })}
            </Button>
            {uncertain && (
              <Alert>
                <AlertDescription>
                  {t("providers.purchaseUncertain")}
                </AlertDescription>
              </Alert>
            )}
            {account && account.purchases.length > 0 && (
              <ProviderSelect
                label={t("providers.localts.recentOrders")}
                value={purchaseId}
                items={account.purchases.map((entry) => ({
                  value: entry.purchase_id,
                  label: `${entry.product_name} (${entry.purchase_id})`,
                }))}
                onChange={(next) => {
                  setPurchaseId(next);
                  setPurchase(null);
                }}
                disabled={busy}
              />
            )}
            <Field>
              <FieldLabel htmlFor={`${id}-purchase`}>
                {t("providers.localts.orderId")}
              </FieldLabel>
              <Input
                id={`${id}-purchase`}
                value={purchaseId}
                disabled={busy}
                onChange={(event) => {
                  setPurchaseId(event.target.value);
                  setPurchase(null);
                }}
              />
            </Field>
            <Button
              variant="outline"
              disabled={busy || !key.trim() || !purchaseId.trim()}
              onClick={() =>
                void run(async (signal) => {
                  const result = await fetchFernanPurchase(
                    key,
                    purchaseId.trim(),
                    signal,
                  );
                  signal.throwIfAborted();
                  setPurchase(result);
                })
              }
            >
              {t("providers.localts.loadOrder")}
            </Button>
            {purchase && (
              <FieldDescription aria-live="polite">
                {t("providers.fernan.delivered", {
                  count: purchase.products.length,
                })}
              </FieldDescription>
            )}
            {purchase?.total_cost !== undefined && (
              <FieldDescription>
                {t("providers.fernan.paid", { total: purchase.total_cost })}
              </FieldDescription>
            )}
            <ProviderSelect
              label={t("providers.localts.importFormat")}
              value={format}
              items={[
                {
                  value: "access-token",
                  label: t("account.import.microsoftAccessToken"),
                },
                {
                  value: "cookies",
                  label: t("account.import.microsoftCookies"),
                },
                {
                  value: "credentials",
                  label: t("account.import.microsoftCredentials"),
                },
              ]}
              onChange={(next) => setFormat(next as FernanImportFormat)}
              disabled={busy}
            />
            <Button
              disabled={busy || !canPurchase || !purchase?.products.length}
              onClick={() => {
                if (!purchase) return;
                try {
                  const result = fernanPurchaseAccounts(purchase, format);
                  onImport(result.payload, result.credentialType);
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
