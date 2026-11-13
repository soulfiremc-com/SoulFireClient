import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  HistoryIcon,
  KeyRoundIcon,
  PackageIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  WalletIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccountImport } from "@/components/providers/flows/fernan-flow.tsx";
import { UncertainNotice } from "@/components/providers/flows/fernan-flow.tsx";
import {
  isUncertainPurchase,
  subtractAmount,
  useAmountFormat,
} from "@/components/providers/flows/flow-helpers.tsx";
import {
  BusyIcon,
  ChoiceCard,
  CopyValue,
  FlowAside,
  Notice,
  ProviderFrame,
  type ProviderFlowProps,
  QuantityField,
  SecretField,
  ShopLink,
  StatTile,
  Stepper,
  SummaryRows,
} from "@/components/providers/provider-ui.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { RadioGroup } from "@/components/ui/radio-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useProviderTask } from "@/hooks/use-provider-task.ts";
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

type Stage = "connect" | "choose" | "review" | "import";
const skeletonSlots = ["first", "second", "third"];

function bestDiscount(product: LocaltsProduct) {
  return Object.entries(product.quantityDiscounts ?? {})
    .map(([quantity, percent]) => ({ quantity: Number(quantity), percent }))
    .filter((tier) => tier.percent > 0)
    .sort((a, b) => a.quantity - b.quantity);
}

function orderReady(order: LocaltsOrder | null) {
  return (
    !!order?.items?.length &&
    order.status === "PACKAGED" &&
    ["COMPLETE", "PARTIALLY_REFUNDED"].includes(order["order-status"])
  );
}

export function LocaltsFlow({
  provider,
  canWrite,
  onBack,
  onBusyChange,
  onClose,
  onImport,
}: ProviderFlowProps<AccountImport>) {
  const { t } = useTranslation("instance");
  const format = useAmountFormat();
  const { busy, error, setError, run } = useProviderTask({
    onBusyChange,
    describeError: (cause) =>
      cause instanceof ProviderApiError
        ? t(
            cause.reason === "limit"
              ? "providers.localts.quantityHelp"
              : `providers.errors.${cause.reason}`,
          )
        : t("providers.errors.network"),
  });
  const [stage, setStage] = useState<Stage>("connect");
  const [mode, setMode] = useState("buy");
  const [key, setKey] = useState("");
  const [products, setProducts] = useState<LocaltsProduct[] | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState(1);
  const [importFormat, setImportFormat] = useState("");
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<LocaltsOrder | null>(null);
  const [orders, setOrders] = useState<{ id: string; productId: string }[]>([]);
  const [purchased, setPurchased] = useState(false);
  const [justBought, setJustBought] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  const product = products?.find((entry) => entry.id === selected);
  const maxAmount = Math.min(1_000, product?.stock ?? 1_000);
  const validAmount =
    Number.isInteger(amount) && amount >= 1 && amount <= maxAmount;
  const total = product && validAmount ? localtsPrice(product, amount) : null;
  const insufficient = total !== null && balance !== null && balance < total;

  useEffect(() => {
    const request = new AbortController();
    void fetchLocaltsProducts(request.signal)
      .then((result) => {
        if (!request.signal.aborted) setProducts(result);
      })
      .catch(() => {
        if (!request.signal.aborted) setCatalogFailed(true);
      });
    return () => {
      request.abort();
    };
  }, []);

  const go = (next: Stage) => {
    setError(null);
    setStage(next);
  };
  const connect = () =>
    run(async (signal) => {
      const [credits, latest, catalog] = await Promise.all([
        fetchLocaltsBalance(key, signal),
        fetchLocaltsOrders(key, signal),
        fetchLocaltsProducts(signal),
      ]);
      signal.throwIfAborted();
      setBalance(credits);
      setOrders(latest);
      setProducts(catalog);
      setCatalogFailed(false);
      // Fresh stock and balance data make another explicit order safe to review.
      setPurchased(false);
      setStage("choose");
    });
  const loadOrder = (id: string) =>
    run(async (signal) => {
      const result = await fetchLocaltsOrder(key, id, signal);
      signal.throwIfAborted();
      setOrder(result);
      setStage("import");
    });

  const steps = (["connect", "choose", "review", "import"] as const).map(
    (id) => ({ id, label: t(`providers.steps.${id}`) }),
  );
  const back =
    stage === "connect"
      ? onBack
      : () => go(stage === "choose" ? "connect" : "choose");
  const ready = orderReady(order);

  return (
    <ProviderFrame
      providerId={provider.id}
      title={provider.name}
      description={t("providers.localts.description")}
      stepper={<Stepper steps={steps} current={stage} />}
      stageKey={stage}
      heading={t(`providers.localts.stage.${stage}`)}
      subheading={t(`providers.localts.stageHelp.${stage}`)}
      aside={
        <FlowAside provider={provider}>
          {balance !== null && (
            <StatTile
              icon={<WalletIcon />}
              label={t("providers.balance")}
              value={t("providers.localts.credits", {
                balance: format(balance),
              })}
              tone={insufficient ? "warning" : "default"}
            />
          )}
        </FlowAside>
      }
      footer={
        <>
          {back ? (
            <Button variant="outline" disabled={busy} onClick={back}>
              <ArrowLeftIcon data-icon="inline-start" />
              {t(
                stage === "connect"
                  ? "providers.allProvidersBack"
                  : "providers.back",
              )}
            </Button>
          ) : (
            <span />
          )}
          {stage === "connect" && (
            <Button
              disabled={busy || !key.trim()}
              onClick={() => void connect()}
            >
              <BusyIcon
                busy={busy}
                icon={<KeyRoundIcon data-icon="inline-start" />}
              />
              {t("providers.connect")}
            </Button>
          )}
          {stage === "choose" && mode === "buy" && (
            <Button
              disabled={
                busy ||
                !product ||
                total === null ||
                insufficient ||
                purchased ||
                uncertain
              }
              onClick={() => go("review")}
            >
              {t("providers.reviewOrder")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )}
          {stage === "choose" && mode === "recover" && (
            <Button
              disabled={busy || !orderId.trim()}
              onClick={() => {
                setJustBought(false);
                void loadOrder(orderId.trim());
              }}
            >
              <BusyIcon
                busy={busy}
                icon={<HistoryIcon data-icon="inline-start" />}
              />
              {t("providers.loadOrder")}
            </Button>
          )}
          {stage === "review" && (
            <Button
              disabled={
                busy ||
                !canWrite ||
                !product ||
                total === null ||
                insufficient ||
                purchased ||
                uncertain
              }
              onClick={() =>
                void run(async (signal) => {
                  if (!product || total === null) return;
                  let id: string;
                  try {
                    id = await purchaseLocaltsAccounts(
                      key,
                      product,
                      amount,
                      total,
                      signal,
                    );
                  } catch (cause) {
                    if (isUncertainPurchase(cause)) setUncertain(true);
                    throw cause;
                  }
                  setOrderId(id);
                  setOrders((previous) => [
                    { id, productId: product.id },
                    ...previous.filter((entry) => entry.id !== id),
                  ]);
                  setOrder(null);
                  setPurchased(true);
                  setJustBought(true);
                  setBalance(null);
                  setStage("import");
                  // Reading the order is safe. A failure here leaves a retry button.
                  const result = await fetchLocaltsOrder(key, id, signal);
                  signal.throwIfAborted();
                  setOrder(result);
                })
              }
            >
              <BusyIcon
                busy={busy}
                icon={<ShoppingCartIcon data-icon="inline-start" />}
              />
              {t("providers.localts.purchase", { total: format(total ?? 0) })}
            </Button>
          )}
          {stage === "import" &&
            (ready ? (
              <Button
                disabled={busy || !canWrite || !importFormat}
                onClick={() => {
                  if (!order || !importFormat) return;
                  try {
                    const accounts = localtsOrderAccounts(
                      order,
                      importFormat as LocaltsImportFormat,
                    );
                    onImport(accounts.payload, accounts.credentialType);
                    onClose();
                  } catch {
                    setError(t("providers.errors.response"));
                  }
                }}
              >
                <DownloadIcon data-icon="inline-start" />
                {t("providers.importAccounts", {
                  count: order?.items?.length ?? 0,
                })}
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={() => void loadOrder(orderId.trim())}
              >
                <BusyIcon
                  busy={busy}
                  icon={<RefreshCwIcon data-icon="inline-start" />}
                />
                {t("providers.checkDelivery")}
              </Button>
            ))}
        </>
      }
    >
      {!canWrite && <Notice>{t("providers.demo")}</Notice>}
      {stage === "connect" && (
        <>
          <SecretField
            autoFocus
            label={t("providers.fields.apiKey")}
            value={key}
            disabled={busy}
            description={t("providers.localts.keyHelp")}
            onChange={(value) => {
              setKey(value);
              setBalance(null);
              setOrders([]);
              setOrder(null);
            }}
          />
          <section
            aria-label={t("providers.liveCatalog")}
            className="flex flex-col gap-2"
          >
            <h4 className="text-foreground/70 text-xs font-medium">
              {t("providers.liveCatalog")}
            </h4>
            {catalogFailed && (
              <Notice tone="error">{t("providers.errors.network")}</Notice>
            )}
            {!products && !catalogFailed && (
              <div className="flex flex-col gap-2">
                {skeletonSlots.map((slot) => (
                  <Skeleton key={slot} className="h-10 w-full" />
                ))}
              </div>
            )}
            {products?.slice(0, 4).map((entry) => (
              <div
                key={entry.id}
                className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm"
              >
                <span className="min-w-0 truncate">{entry.name}</span>
                <span className="text-foreground/70 shrink-0 text-xs tabular-nums">
                  {t("providers.localts.priceStock", {
                    price: format(entry.priceInCredits),
                    stock: format(entry.stock),
                  })}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
      {stage === "choose" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              variant="outline"
              size="sm"
              aria-label={t("providers.action")}
              aria-orientation={undefined}
              disabled={busy}
              value={[mode]}
              onValueChange={(next: string[]) => {
                if (next[0]) {
                  setMode(next[0]);
                  setError(null);
                }
              }}
            >
              <ToggleGroupItem value="buy">
                <ShoppingCartIcon />
                {t("providers.modeBuy")}
              </ToggleGroupItem>
              <ToggleGroupItem value="recover">
                <HistoryIcon />
                {t("providers.modeRecover")}
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void connect()}
            >
              <BusyIcon
                busy={busy}
                icon={<RefreshCwIcon data-icon="inline-start" />}
              />
              {t("providers.refresh")}
            </Button>
          </div>
          {mode === "buy" && (
            <>
              {purchased && (
                <Notice tone="success">{t("providers.placedRefresh")}</Notice>
              )}
              {uncertain && <UncertainNotice />}
              {products?.length ? (
                <RadioGroup
                  aria-label={t("providers.product")}
                  value={selected}
                  disabled={busy}
                  onValueChange={(next) => {
                    setSelected(String(next));
                    setAmount(1);
                  }}
                >
                  {products.map((entry) => {
                    const tiers = bestDiscount(entry);
                    return (
                      <ChoiceCard
                        key={entry.id}
                        value={entry.id}
                        disabled={entry.stock === 0}
                      >
                        <span className="bg-provider/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                          <PackageIcon aria-hidden className="size-4" />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="font-medium">{entry.name}</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant={entry.stock ? "secondary" : "outline"}
                            >
                              {entry.stock
                                ? t("providers.inStock", { count: entry.stock })
                                : t("providers.outOfStock")}
                            </Badge>
                            <span className="text-foreground/70 text-xs">
                              {t("providers.localts.perAccount", {
                                price: format(entry.priceInCredits),
                              })}
                            </span>
                            {tiers[0] && (
                              <Badge
                                variant="outline"
                                className="text-success-emphasis border-success/40"
                              >
                                {t("providers.localts.discountTier", {
                                  percent: tiers[0].percent,
                                  quantity: tiers[0].quantity,
                                })}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </ChoiceCard>
                    );
                  })}
                </RadioGroup>
              ) : (
                <Notice>{t("providers.noProducts")}</Notice>
              )}
              {product && (
                <QuantityField
                  label={t("providers.quantity")}
                  value={amount}
                  max={maxAmount}
                  disabled={busy}
                  onChange={setAmount}
                />
              )}
              {insufficient && (
                <Notice
                  tone="warning"
                  title={t("providers.lowBalanceTitle")}
                  action={
                    <ShopLink
                      provider={provider}
                      label={t("providers.addFunds", {
                        provider: provider.name,
                      })}
                    />
                  }
                >
                  {t("providers.lowBalanceBody")}
                </Notice>
              )}
            </>
          )}
          {mode === "recover" && (
            <>
              {orders.length > 0 ? (
                <RadioGroup
                  aria-label={t("providers.recentOrders")}
                  value={orderId}
                  disabled={busy}
                  onValueChange={(next) => setOrderId(String(next))}
                >
                  {orders.map((entry) => (
                    <ChoiceCard key={entry.id} value={entry.id}>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">
                          {products?.find((item) => item.id === entry.productId)
                            ?.name ?? entry.productId}
                        </span>
                        <span className="text-foreground/70 truncate font-mono text-xs">
                          {entry.id}
                        </span>
                      </div>
                    </ChoiceCard>
                  ))}
                </RadioGroup>
              ) : (
                <Notice>{t("providers.noRecentOrders")}</Notice>
              )}
              <SecretField
                secret={false}
                label={t("providers.orderId")}
                value={orderId}
                disabled={busy}
                onChange={setOrderId}
              />
            </>
          )}
        </>
      )}
      {stage === "review" && product && total !== null && (
        <>
          <SummaryRows
            rows={[
              {
                id: "product",
                label: t("providers.product"),
                value: product.name,
              },
              { id: "quantity", label: t("providers.quantity"), value: amount },
              {
                id: "unit",
                label: t("providers.unitPrice"),
                value: t("providers.localts.credits", {
                  balance: format(product.priceInCredits),
                }),
              },
              {
                id: "balance",
                label: t("providers.balanceAfter"),
                value: t("providers.localts.credits", {
                  balance: format(subtractAmount(balance ?? 0, total)),
                }),
              },
              {
                id: "total",
                label: t("providers.total"),
                value: t("providers.localts.credits", {
                  balance: format(total),
                }),
                strong: true,
              },
            ]}
          />
          <p className="text-foreground/70 text-xs">
            {t("providers.localts.reviewNote")}
          </p>
          {uncertain && (
            <UncertainNotice
              onRecover={() => {
                setMode("recover");
                void connect();
              }}
            />
          )}
        </>
      )}
      {stage === "import" && (
        <>
          {justBought && (
            <Notice tone="success" title={t("providers.purchaseComplete")}>
              {t("providers.localts.purchased")}
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-foreground/70">{t("providers.orderId")}</span>
            <CopyValue value={orderId} />
          </div>
          {busy && !order && <Skeleton className="h-16 w-full" />}
          {order && order["order-status"] === "REFUNDED" && (
            <Notice tone="error" title={t("providers.localts.refundedTitle")}>
              {t("providers.localts.refundedBody")}
            </Notice>
          )}
          {order && order["order-status"] !== "REFUNDED" && !ready && (
            <Notice
              tone="warning"
              title={t("providers.localts.packagingTitle")}
            >
              {t("providers.localts.packagingBody")}
            </Notice>
          )}
          {order && (
            <p className="text-foreground/70 text-xs">
              {t("providers.localts.orderStatus", {
                status: order["order-status"],
                count: order.items?.length ?? 0,
              })}
            </p>
          )}
          {ready && (
            <RadioGroup
              aria-label={t("providers.importFormat")}
              value={importFormat}
              disabled={busy}
              onValueChange={(next) => setImportFormat(String(next))}
            >
              {(
                [
                  ["cookies", "providers.localts.cookieTokens"],
                  ["credentials", "account.import.microsoftCredentials"],
                  ["refresh-token", "account.import.microsoftRefreshToken"],
                  ["access-token", "account.import.microsoftAccessToken"],
                ] as const
              ).map(([value, label]) => (
                <ChoiceCard key={value} value={value}>
                  <span className="font-medium">{t(label)}</span>
                </ChoiceCard>
              ))}
            </RadioGroup>
          )}
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </ProviderFrame>
  );
}
