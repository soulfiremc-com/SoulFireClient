import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  KeyRoundIcon,
  PackageIcon,
  ShoppingCartIcon,
  WalletIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccountImport } from "@/components/providers/flows/fernan-flow.tsx";
import { UncertainNotice } from "@/components/providers/flows/fernan-flow.tsx";
import {
  isUncertainPurchase,
  useAmountFormat,
} from "@/components/providers/flows/flow-helpers.tsx";
import {
  BusyIcon,
  ChoiceCard,
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
import { useProviderTask } from "@/hooks/use-provider-task.ts";
import { ProviderApiError } from "@/lib/provider-request.ts";
import {
  fetchKeyInfo,
  fetchStock,
  formatStockType,
  getRavealtsApiKey,
  mapPurchasedAccounts,
  purchaseAccounts,
  RavealtsApiError,
  type RavealtsStock,
  setRavealtsApiKey,
} from "@/lib/ravealts.ts";

type Stage = "connect" | "choose" | "review" | "import";
const skeletonSlots = ["first", "second"];

export function RavealtsFlow({
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
    describeError: (cause) => {
      if (cause instanceof RavealtsApiError) {
        switch (cause.errorType) {
          case "rate_limited":
            return t("account.ravealts.rateLimited");
          case "insufficient_balance":
            return t("account.ravealts.insufficientBalance");
          case "out_of_stock":
            return t("account.ravealts.outOfStock");
          default:
            return t("providers.errors.rejected");
        }
      }
      if (cause instanceof ProviderApiError && cause.reason !== "network")
        return t(`providers.errors.${cause.reason}`);
      return t("account.ravealts.networkError");
    },
  });
  const [stage, setStage] = useState<Stage>("connect");
  const [key, setKey] = useState(() => getRavealtsApiKey());
  const [credits, setCredits] = useState<number | null>(null);
  const [stock, setStock] = useState<RavealtsStock | null>(null);
  const [stockFailed, setStockFailed] = useState(false);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState(1);
  const [delivered, setDelivered] = useState(0);
  const [uncertain, setUncertain] = useState(false);

  const available = Object.entries(stock ?? {}).filter(
    ([, count]) => count > 0,
  );
  const selectedStock = stock?.[selected] ?? 0;
  const maxAmount = Math.min(10, selectedStock);
  const validAmount =
    Number.isInteger(amount) && amount >= 1 && amount <= maxAmount;

  const loadStock = (signal?: AbortSignal) =>
    fetchStock()
      .then((result) => {
        if (signal?.aborted) return;
        setStock(result.stock);
        setStockFailed(false);
      })
      .catch(() => {
        if (!signal?.aborted) setStockFailed(true);
      });
  useEffect(() => {
    const request = new AbortController();
    void loadStock(request.signal);
    return () => {
      request.abort();
    };
  }, []);

  const go = (next: Stage) => {
    setError(null);
    setStage(next);
  };
  const steps = (["connect", "choose", "review", "import"] as const).map(
    (id) => ({ id, label: t(`providers.steps.${id}`) }),
  );
  const back =
    stage === "connect"
      ? onBack
      : stage === "choose"
        ? () => go("connect")
        : stage === "review"
          ? () => go("choose")
          : undefined;

  return (
    <ProviderFrame
      providerId={provider.id}
      title={provider.name}
      description={t("account.ravealts.description")}
      stepper={<Stepper steps={steps} current={stage} />}
      stageKey={stage}
      heading={t(`providers.ravealts.stage.${stage}`)}
      subheading={t(`providers.ravealts.stageHelp.${stage}`)}
      aside={
        <FlowAside provider={provider} savesKey>
          {credits !== null && (
            <StatTile
              icon={<WalletIcon />}
              label={t("providers.balance")}
              value={t("providers.localts.credits", {
                balance: format(credits),
              })}
              tone={credits === 0 ? "warning" : "default"}
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
              onClick={() =>
                void run(async () => {
                  const result = await fetchKeyInfo(key.trim());
                  setCredits(result.available_credits);
                  setRavealtsApiKey(key.trim());
                  setStage("choose");
                })
              }
            >
              <BusyIcon
                busy={busy}
                icon={<KeyRoundIcon data-icon="inline-start" />}
              />
              {t("providers.connect")}
            </Button>
          )}
          {stage === "choose" && (
            <Button
              disabled={busy || !selected || !validAmount || uncertain}
              onClick={() => go("review")}
            >
              {t("providers.reviewOrder")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )}
          {stage === "review" && (
            <Button
              disabled={
                busy || !canWrite || !selected || !validAmount || uncertain
              }
              onClick={() =>
                void run(async () => {
                  try {
                    const accounts = (
                      await purchaseAccounts(key.trim(), selected, amount)
                    ).accounts;
                    if (!Array.isArray(accounts) || !accounts.length)
                      throw new ProviderApiError("response");
                    // Ravealts has no order lookup, so import the delivery at once.
                    const { payload, credentialType } =
                      mapPurchasedAccounts(accounts);
                    onImport(payload, credentialType);
                    setDelivered(accounts.length);
                    setStage("import");
                    void loadStock();
                    void fetchKeyInfo(key.trim())
                      .then((result) => setCredits(result.available_credits))
                      .catch(() => undefined);
                  } catch (cause) {
                    if (
                      !(cause instanceof RavealtsApiError) &&
                      isUncertainPurchase(cause)
                    )
                      setUncertain(true);
                    throw cause;
                  }
                })
              }
            >
              <BusyIcon
                busy={busy}
                icon={<ShoppingCartIcon data-icon="inline-start" />}
              />
              {t("providers.ravealts.purchase", { count: amount })}
            </Button>
          )}
          {stage === "import" && (
            <div className="flex w-full justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelected("");
                  setAmount(1);
                  go("choose");
                }}
              >
                {t("providers.buyMore")}
              </Button>
              <Button onClick={onClose}>
                <CheckIcon data-icon="inline-start" />
                {t("providers.done")}
              </Button>
            </div>
          )}
        </>
      }
    >
      {!canWrite && <Notice>{t("providers.demo")}</Notice>}
      {stage === "connect" && (
        <>
          <SecretField
            autoFocus
            label={t("providers.fields.apiKey")}
            placeholder={t("account.ravealts.apiKeyPlaceholder")}
            value={key}
            disabled={busy}
            description={t("providers.ravealts.keyHelp")}
            onChange={(value) => {
              setKey(value);
              setCredits(null);
            }}
          />
          <section className="flex flex-col gap-2">
            <h4 className="text-foreground/70 text-xs font-medium">
              {t("providers.liveCatalog")}
            </h4>
            {stockFailed && (
              <Notice tone="error">{t("account.ravealts.networkError")}</Notice>
            )}
            {!stock && !stockFailed && (
              <div className="flex gap-2">
                {skeletonSlots.map((slot) => (
                  <Skeleton key={slot} className="h-6 w-28" />
                ))}
              </div>
            )}
            {stock && available.length === 0 && (
              <p className="text-foreground/70 text-sm">
                {t("account.ravealts.noStock")}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {available.map(([type, count]) => (
                <Badge key={type} variant="secondary">
                  {formatStockType(type)}: {format(count)}
                </Badge>
              ))}
            </div>
          </section>
        </>
      )}
      {stage === "choose" && (
        <>
          {uncertain && <UncertainNotice />}
          {credits === 0 && (
            <Notice
              tone="warning"
              title={t("providers.lowBalanceTitle")}
              action={
                <ShopLink
                  provider={provider}
                  label={t("providers.addFunds", { provider: provider.name })}
                />
              }
            >
              {t("providers.lowBalanceBody")}
            </Notice>
          )}
          {available.length === 0 ? (
            <Notice>{t("account.ravealts.noStock")}</Notice>
          ) : (
            <RadioGroup
              aria-label={t("account.ravealts.accountType")}
              value={selected}
              disabled={busy}
              onValueChange={(next) => {
                setSelected(String(next));
                setAmount(1);
              }}
            >
              {available.map(([type, count]) => (
                <ChoiceCard key={type} value={type}>
                  <span className="bg-provider/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                    <PackageIcon aria-hidden className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-medium">{formatStockType(type)}</span>
                    <div>
                      <Badge variant="secondary">
                        {t("providers.inStock", { count })}
                      </Badge>
                    </div>
                  </div>
                </ChoiceCard>
              ))}
            </RadioGroup>
          )}
          {selected && (
            <QuantityField
              label={t("providers.quantity")}
              value={amount}
              max={maxAmount}
              disabled={busy}
              onChange={setAmount}
              description={t("providers.ravealts.quantityHelp")}
            />
          )}
        </>
      )}
      {stage === "review" && (
        <>
          <SummaryRows
            rows={[
              {
                id: "type",
                label: t("account.ravealts.accountType"),
                value: formatStockType(selected),
              },
              { id: "quantity", label: t("providers.quantity"), value: amount },
              {
                id: "balance",
                label: t("providers.balance"),
                value: t("providers.localts.credits", {
                  balance: format(credits ?? 0),
                }),
              },
            ]}
          />
          <Notice>{t("providers.ravealts.priceNote")}</Notice>
          {uncertain && <UncertainNotice />}
        </>
      )}
      {stage === "import" && (
        <Notice tone="success" title={t("providers.purchaseComplete")}>
          {t("providers.ravealts.importing", { count: delivered })}
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </ProviderFrame>
  );
}
