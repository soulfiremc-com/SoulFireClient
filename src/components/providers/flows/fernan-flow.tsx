import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  HistoryIcon,
  KeyRoundIcon,
  PackageIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  TimerIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isUncertainPurchase,
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { RadioGroup } from "@/components/ui/radio-group.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import { useProviderTask } from "@/hooks/use-provider-task.ts";
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

type Stage = "connect" | "choose" | "review" | "import";
export type AccountImport = (
  payload: string[],
  type: AccountTypeCredentials,
) => void;

export function FernanFlow({
  provider,
  canWrite,
  onBack,
  onBusyChange,
  onClose,
  onImport,
}: ProviderFlowProps<AccountImport>) {
  const { t } = useTranslation("instance");
  const format = useAmountFormat();
  const referralId = useId();
  const task = useProviderTask({
    onBusyChange,
    describeError: (cause) =>
      cause instanceof ProviderApiError
        ? t(`providers.errors.${cause.reason}`)
        : t("providers.errors.network"),
  });
  const { busy, error, setError, run } = task;
  const [stage, setStage] = useState<Stage>("connect");
  const [mode, setMode] = useState("buy");
  const [key, setKey] = useState("");
  const [account, setAccount] = useState<FernanAccount | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState(1);
  const [referral, setReferral] = useState(provider.coupon ?? "");
  const [purchaseId, setPurchaseId] = useState("");
  const [purchase, setPurchase] = useState<FernanPurchase | null>(null);
  const [justBought, setJustBought] = useState(false);
  const [importFormat, setImportFormat] =
    useState<FernanImportFormat>("access-token");
  const [purchased, setPurchased] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  const product = account?.stock.find(
    (entry) => String(entry.product_id) === selected,
  );
  const limit =
    product && account ? fernanPurchaseLimit(product, account.cooldowns) : 0;
  const validAmount =
    Number.isInteger(amount) && amount >= 1 && amount <= limit;
  const total = product && validAmount ? product.price * amount : null;
  const validReferral = referral === "" || /^[a-z\d]{3,16}$/i.test(referral);
  const insufficient = total !== null && balance !== null && balance < total;

  const go = (next: Stage) => {
    setError(null);
    setStage(next);
  };
  const connect = () =>
    run(async (signal) => {
      const result = await fetchFernanAccount(key, signal);
      signal.throwIfAborted();
      setAccount(result);
      setBalance(result.balance);
      // Fresh stock and balance data make another explicit order safe to review.
      setPurchased(false);
      setStage("choose");
    });

  const steps = (["connect", "choose", "review", "import"] as const).map(
    (id) => ({ id, label: t(`providers.steps.${id}`) }),
  );
  const stockBadge = (entry: FernanAccount["stock"][number]) => {
    const cooldown = account?.cooldowns.find(
      (item) => item.product_id === entry.product_id,
    );
    if (entry.count === 0)
      return <Badge variant="outline">{t("providers.outOfStock")}</Badge>;
    if (!cooldown || cooldown.on_cooldown)
      return (
        <Badge
          variant="outline"
          className="border-warning/40 text-warning-emphasis"
        >
          <TimerIcon data-icon="inline-start" />
          {t("providers.onCooldown")}
        </Badge>
      );
    return (
      <Badge variant="secondary">
        {t("providers.inStock", { count: entry.count })}
      </Badge>
    );
  };

  const back =
    stage === "connect"
      ? onBack
      : () =>
          go(
            stage === "import"
              ? "choose"
              : stage === "review"
                ? "choose"
                : "connect",
          );

  return (
    <ProviderFrame
      providerId={provider.id}
      title={provider.name}
      description={t("providers.fernan.description")}
      stepper={<Stepper steps={steps} current={stage} />}
      stageKey={stage}
      heading={t(`providers.fernan.stage.${stage}`)}
      subheading={t(`providers.fernan.stageHelp.${stage}`)}
      aside={
        <FlowAside provider={provider}>
          {balance !== null && (
            <StatTile
              icon={<WalletIcon />}
              label={t("providers.balance")}
              value={format(balance)}
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
                !validReferral ||
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
              disabled={busy || !purchaseId.trim()}
              onClick={() =>
                void run(async (signal) => {
                  const result = await fetchFernanPurchase(
                    key,
                    purchaseId.trim(),
                    signal,
                  );
                  signal.throwIfAborted();
                  setPurchase(result);
                  setJustBought(false);
                  setStage("import");
                })
              }
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
                !validReferral ||
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
                    setJustBought(true);
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
                    setStage("import");
                  } catch (cause) {
                    if (isUncertainPurchase(cause)) setUncertain(true);
                    throw cause;
                  }
                })
              }
            >
              <BusyIcon
                busy={busy}
                icon={<ShoppingCartIcon data-icon="inline-start" />}
              />
              {t("providers.fernan.purchase", { count: amount })}
            </Button>
          )}
          {stage === "import" && (
            <Button
              disabled={busy || !canWrite || !purchase?.products.length}
              onClick={() => {
                if (!purchase) return;
                try {
                  const result = fernanPurchaseAccounts(purchase, importFormat);
                  onImport(result.payload, result.credentialType);
                  onClose();
                } catch {
                  setError(t("providers.errors.response"));
                }
              }}
            >
              <DownloadIcon data-icon="inline-start" />
              {t("providers.importAccounts", {
                count: purchase?.products.length ?? 0,
              })}
            </Button>
          )}
        </>
      }
    >
      {!canWrite && <Notice>{t("providers.demo")}</Notice>}
      {stage === "connect" && (
        <SecretField
          autoFocus
          label={t("providers.fields.apiKey")}
          value={key}
          disabled={busy}
          description={t("providers.fernan.keyHelp")}
          onChange={(value) => {
            setKey(value);
            setAccount(null);
            setBalance(null);
            setPurchase(null);
          }}
        />
      )}
      {stage === "choose" && account && (
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
              {account.stock.length === 0 ? (
                <Notice
                  action={
                    <ShopLink
                      provider={provider}
                      label={t("providers.openShop", {
                        provider: provider.name,
                      })}
                    />
                  }
                >
                  {t("providers.noProducts")}
                </Notice>
              ) : (
                <RadioGroup
                  aria-label={t("providers.product")}
                  value={selected}
                  disabled={busy}
                  onValueChange={(next) => {
                    setSelected(String(next));
                    setAmount(1);
                  }}
                >
                  {account.stock.map((entry) => (
                    <ChoiceCard
                      key={entry.product_id}
                      value={String(entry.product_id)}
                      disabled={
                        fernanPurchaseLimit(entry, account.cooldowns) === 0
                      }
                    >
                      <span className="bg-provider/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                        <PackageIcon aria-hidden className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium">
                          {entry.product_name}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {stockBadge(entry)}
                          <span className="text-foreground/70 text-xs">
                            {t("providers.fernan.perAccount", {
                              price: format(entry.price),
                            })}
                          </span>
                        </div>
                      </div>
                    </ChoiceCard>
                  ))}
                </RadioGroup>
              )}
              {product && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <QuantityField
                    label={t("providers.quantity")}
                    value={amount}
                    max={limit}
                    disabled={busy}
                    onChange={setAmount}
                    description={t("providers.fernan.limit", { count: limit })}
                  />
                  <Field data-invalid={!validReferral || undefined}>
                    <FieldLabel htmlFor={referralId}>
                      {t("providers.referralCode")}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={referralId}
                        maxLength={16}
                        value={referral}
                        disabled={busy}
                        aria-invalid={!validReferral}
                        onChange={(event) => setReferral(event.target.value)}
                      />
                      {referral && (
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            size="icon-xs"
                            aria-label={t("providers.removeCode")}
                            disabled={busy}
                            onClick={() => setReferral("")}
                          >
                            <XIcon />
                          </InputGroupButton>
                        </InputGroupAddon>
                      )}
                    </InputGroup>
                    <FieldDescription>
                      {t("providers.fernan.referralHelp")}
                    </FieldDescription>
                  </Field>
                </div>
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
              {account.purchases.length > 0 ? (
                <RadioGroup
                  aria-label={t("providers.recentOrders")}
                  value={purchaseId}
                  disabled={busy}
                  onValueChange={(next) => setPurchaseId(String(next))}
                >
                  {account.purchases.map((entry) => (
                    <ChoiceCard
                      key={entry.purchase_id}
                      value={entry.purchase_id}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">
                          {entry.product_name}
                        </span>
                        <span className="text-foreground/70 truncate font-mono text-xs">
                          {entry.purchase_id}
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
                value={purchaseId}
                disabled={busy}
                onChange={setPurchaseId}
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
                value: product.product_name,
              },
              { id: "quantity", label: t("providers.quantity"), value: amount },
              {
                id: "unit",
                label: t("providers.unitPrice"),
                value: format(product.price),
              },
              {
                id: "code",
                label: t("providers.referralCode"),
                value: referral || t("providers.noCode"),
              },
              {
                id: "balance",
                label: t("providers.balance"),
                value: format(balance ?? 0),
              },
              {
                id: "total",
                label: t("providers.fernan.listedTotal"),
                value: format(total),
                strong: true,
              },
            ]}
          />
          <p className="text-foreground/70 text-xs">
            {t("providers.fernan.total")}
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
      {stage === "import" && purchase && (
        <>
          <Notice
            tone="success"
            title={t(
              justBought
                ? "providers.purchaseComplete"
                : "providers.orderLoaded",
            )}
          >
            {t("providers.fernan.delivered", {
              count: purchase.products.length,
            })}
            {purchase.total_cost !== undefined &&
              ` ${t("providers.fernan.paid", { total: format(purchase.total_cost) })}`}
          </Notice>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-foreground/70">{t("providers.orderId")}</span>
            <CopyValue value={purchase.purchase_id} />
          </div>
          <RadioGroup
            aria-label={t("providers.importFormat")}
            value={importFormat}
            disabled={busy}
            onValueChange={(next) =>
              setImportFormat(next as FernanImportFormat)
            }
          >
            {(
              [
                ["access-token", "account.import.microsoftAccessToken"],
                ["cookies", "account.import.microsoftCookies"],
                ["credentials", "account.import.microsoftCredentials"],
              ] as const
            ).map(([value, label]) => (
              <ChoiceCard key={value} value={value}>
                <span className="font-medium">{t(label)}</span>
              </ChoiceCard>
            ))}
          </RadioGroup>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </ProviderFrame>
  );
}

export function UncertainNotice({ onRecover }: { onRecover?: () => void }) {
  const { t } = useTranslation("instance");
  return (
    <Notice
      tone="warning"
      title={t("providers.uncertainTitle")}
      action={
        onRecover && (
          <Button variant="outline" size="sm" onClick={onRecover}>
            <HistoryIcon data-icon="inline-start" />
            {t("providers.checkOrders")}
          </Button>
        )
      }
    >
      {t("providers.purchaseUncertain")}
    </Notice>
  );
}
