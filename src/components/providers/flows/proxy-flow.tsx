import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  GlobeIcon,
  ServerIcon,
  ShoppingCartIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { UncertainNotice } from "@/components/providers/flows/fernan-flow.tsx";
import {
  isUncertainPurchase,
  subtractAmount,
  useAmountFormat,
} from "@/components/providers/flows/flow-helpers.tsx";
import { ProviderSelect } from "@/components/providers/provider-select.tsx";
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
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { RadioGroup } from "@/components/ui/radio-group.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import { useProviderTask } from "@/hooks/use-provider-task.ts";
import { ProviderApiError } from "@/lib/provider-request.ts";
import { getProxyKey } from "@/lib/proxy-selection.ts";
import {
  CONNECTION_FIELDS,
  loadProviderProxies,
  MAX_PROVIDER_PROXIES,
  purchaseSellerOrder,
  quoteSellerOrder,
  type ConnectionField,
  type ProviderConnection,
  type SellerOrder,
  type SellerQuote,
} from "@/lib/proxy-providers.ts";
import type { ProfileProxy } from "@/lib/types.ts";

type Stage = "connect" | "choose" | "review" | "ordered" | "import";
const CREDENTIALS: ConnectionField[] = [
  "apiKey",
  "username",
  "password",
  "sign",
];
const PREVIEW_ROWS = 6;
const staticProducts = [
  { value: "ipv4", label: "IPv4" },
  { value: "ipv6", label: "IPv6" },
  { value: "isp", label: "ISP" },
];

export function ProxyFlow({
  provider,
  canWrite,
  onBack,
  onBusyChange,
  onClose,
  onImport,
}: ProviderFlowProps<(proxies: ProfileProxy[]) => Promise<void>>) {
  const { t } = useTranslation("instance");
  const format = useAmountFormat();
  const couponId = useId();
  const countryId = useId();
  const connection = provider.connection!;
  const sellsHere = provider.capabilities.includes("buy");
  const { busy, error, setError, run } = useProviderTask({
    onBusyChange,
    describeError: (cause) =>
      cause instanceof ProviderApiError
        ? t(`providers.errors.${cause.reason}`)
        : t("providers.errors.save"),
  });
  const [stage, setStage] = useState<Stage>("connect");
  const [mode, setMode] = useState(sellsHere ? "buy" : "import");
  const [values, setValues] = useState<ProviderConnection>({
    apiKey: "",
    username: "",
    password: "",
    sign: "",
    resourceId: "",
    product: connection === "proxyscrape" ? "datacenter_shared" : "ipv4",
    mode: "direct",
    limit: 100,
    country: "",
    protocol:
      connection === "decodo" || connection === "oxylabs"
        ? ProxyProto_Type.HTTP
        : ProxyProto_Type.SOCKS5,
  });
  const [proxies, setProxies] = useState<ProfileProxy[] | null>(null);
  const [quote, setQuote] = useState<SellerQuote | null>(null);
  const [orderCountry, setOrderCountry] = useState("USA");
  const [quantity, setQuantity] = useState(1);
  const [coupon, setCoupon] = useState(provider.coupon ?? "");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);

  function update<K extends keyof ProviderConnection>(
    key: K,
    value: ProviderConnection[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setProxies(null);
    setQuote(null);
    setError(null);
  }

  const fields = CONNECTION_FIELDS[connection];
  const credentialFields = fields.filter((field) =>
    CREDENTIALS.includes(field),
  );
  const hasCredentials = credentialFields.every(
    (field) => String(values[field]).trim().length > 0,
  );
  const validLimit =
    Number.isInteger(values.limit) &&
    values.limit >= 1 &&
    values.limit <= MAX_PROVIDER_PROXIES;
  const hasResource =
    !fields.includes("resourceId") || values.resourceId.trim().length > 0;
  const canLoad = hasCredentials && validLimit && hasResource && canWrite;
  const validOrder =
    /^[A-Z]{3}$/.test(orderCountry) &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_PROVIDER_PROXIES;
  const order: SellerOrder = {
    product: values.product as SellerOrder["product"],
    country: orderCountry,
    period: "1m",
    quantity,
    coupon,
  };
  const buying = mode === "buy";
  const steps = (
    buying
      ? (["connect", "choose", "review", "import"] as const)
      : (["connect", "choose", "import"] as const)
  ).map((id) => ({ id, label: t(`providers.steps.${id}`) }));
  const stepperStage = stage === "ordered" ? "import" : stage;
  // The proxy list preview uses its own copy, so "import" here is the order step.
  const copy = buying || stage === "ordered" ? "sellerBuy" : "proxy";
  const headingStage = (stage === "ordered" ? "import" : stage) as Exclude<
    Stage,
    "ordered" | "import"
  >;
  const insufficient = quote !== null && quote.balance < quote.total;

  const go = (next: Stage) => {
    setError(null);
    setStage(next);
  };
  const loadProxies = () =>
    run(async (signal) => {
      const result = await loadProviderProxies(connection, values, signal);
      signal.throwIfAborted();
      setProxies(result);
      setStage("import");
    });
  const back =
    stage === "connect"
      ? onBack
      : () => {
          if (stage === "choose") go("connect");
          else if (stage === "review") go("choose");
          else if (stage === "ordered") go("choose");
          else go(orderId ? "ordered" : "choose");
        };

  return (
    <ProviderFrame
      providerId={provider.id}
      title={provider.name}
      description={t(`providers.scope.${connection}`)}
      stepper={<Stepper steps={steps} current={stepperStage} />}
      stageKey={stage}
      heading={
        stage === "import"
          ? t("providers.proxy.stage.review")
          : t(`providers.${copy}.stage.${headingStage}`)
      }
      subheading={
        stage === "import"
          ? t("providers.proxy.stageHelp.review")
          : t(`providers.${copy}.stageHelp.${headingStage}`)
      }
      aside={
        <FlowAside provider={provider}>
          {quote && (
            <StatTile
              icon={<WalletIcon />}
              label={t("providers.balance")}
              value={`${format(quote.balance)} ${quote.currency}`}
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
            <Button disabled={!hasCredentials} onClick={() => go("choose")}>
              {t("providers.continue")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )}
          {stage === "choose" && !buying && (
            <Button
              disabled={busy || !canLoad}
              onClick={() => void loadProxies()}
            >
              <BusyIcon
                busy={busy}
                icon={<DownloadIcon data-icon="inline-start" />}
              />
              {t("providers.loadProxies")}
            </Button>
          )}
          {stage === "choose" && buying && (
            <Button
              disabled={
                busy || !canWrite || !validOrder || !!orderId || uncertain
              }
              onClick={() =>
                void run(async (signal) => {
                  const result = await quoteSellerOrder(
                    values.apiKey,
                    order,
                    signal,
                  );
                  signal.throwIfAborted();
                  setQuote(result);
                  setStage("review");
                })
              }
            >
              <BusyIcon
                busy={busy}
                icon={<ArrowRightIcon data-icon="inline-start" />}
              />
              {t("providers.checkPrice")}
            </Button>
          )}
          {stage === "review" && quote && (
            <Button
              disabled={
                busy || insufficient || !!orderId || uncertain || !canWrite
              }
              onClick={() =>
                void run(async (signal) => {
                  try {
                    const id = await purchaseSellerOrder(
                      values.apiKey,
                      order,
                      quote,
                      signal,
                    );
                    setOrderId(id);
                    update("resourceId", id);
                    setStage("ordered");
                  } catch (cause) {
                    setQuote(null);
                    if (isUncertainPurchase(cause)) setUncertain(true);
                    setStage("choose");
                    throw cause;
                  }
                })
              }
            >
              <BusyIcon
                busy={busy}
                icon={<ShoppingCartIcon data-icon="inline-start" />}
              />
              {t("providers.purchase", {
                total: format(quote.total),
                currency: quote.currency,
              })}
            </Button>
          )}
          {stage === "ordered" && (
            <Button
              disabled={busy || !canLoad}
              onClick={() => void loadProxies()}
            >
              <BusyIcon
                busy={busy}
                icon={<DownloadIcon data-icon="inline-start" />}
              />
              {t("providers.loadProxies")}
            </Button>
          )}
          {stage === "import" && proxies && (
            <Button
              disabled={busy || !canWrite}
              onClick={() =>
                void run(async () => {
                  await onImport(proxies);
                  onClose();
                })
              }
            >
              <BusyIcon
                busy={busy}
                icon={<DownloadIcon data-icon="inline-start" />}
              />
              {t("providers.importProxies", { count: proxies.length })}
            </Button>
          )}
        </>
      }
    >
      {!canWrite && <Notice>{t("providers.demo")}</Notice>}
      {stage === "connect" && (
        <FieldGroup>
          {credentialFields.map((field, index) => (
            <SecretField
              key={field}
              autoFocus={index === 0}
              label={t(`providers.fields.${field}`)}
              secret={field !== "username"}
              value={String(values[field])}
              onChange={(next) => update(field, next as never)}
            />
          ))}
          {connection === "proxyscrape" && (
            <FieldDescription>
              {t("providers.proxyscrapeCredentials")}
            </FieldDescription>
          )}
        </FieldGroup>
      )}
      {stage === "choose" && (
        <>
          {sellsHere && (
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
              <ToggleGroupItem value="import">
                <DownloadIcon />
                {t("providers.importExisting")}
              </ToggleGroupItem>
              <ToggleGroupItem value="buy">
                <ShoppingCartIcon />
                {t("providers.buyWithBalance")}
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          {connection === "proxy-seller" && (
            <RadioGroup
              aria-label={t("providers.product")}
              value={values.product}
              disabled={busy}
              className="grid-cols-3"
              onValueChange={(next) => update("product", String(next))}
            >
              {staticProducts.map((product) => (
                <ChoiceCard key={product.value} value={product.value}>
                  <ServerIcon
                    aria-hidden
                    className="text-primary size-4 shrink-0"
                  />
                  <span className="font-medium">{product.label}</span>
                </ChoiceCard>
              ))}
            </RadioGroup>
          )}
          {!buying && (
            <FieldGroup>
              {connection === "webshare" && (
                <ProviderSelect
                  label={t("providers.product")}
                  value={values.mode}
                  items={[
                    { value: "direct", label: t("providers.direct") },
                    { value: "backbone", label: t("providers.backbone") },
                  ]}
                  onChange={(next) => update("mode", next)}
                  disabled={busy}
                />
              )}
              {connection === "proxyscrape" && (
                <ProviderSelect
                  label={t("providers.product")}
                  value={values.product}
                  items={[
                    {
                      value: "datacenter_shared",
                      label: t("providers.sharedDatacenter"),
                    },
                    {
                      value: "datacenter_dedicated",
                      label: t("providers.dedicatedDatacenter"),
                    },
                  ]}
                  onChange={(next) => update("product", next)}
                  disabled={busy}
                />
              )}
              {fields.includes("resourceId") && (
                <SecretField
                  secret={false}
                  label={t("providers.fields.resourceId")}
                  value={values.resourceId}
                  disabled={busy}
                  description={t(`providers.resourceHelp.${connection}`)}
                  onChange={(next) => update("resourceId", next)}
                />
              )}
              {connection === "proxy-seller" && (
                <SecretField
                  secret={false}
                  label={t("providers.optionalOrderId")}
                  value={values.resourceId}
                  disabled={busy}
                  description={t("providers.optionalOrderHelp")}
                  onChange={(next) => update("resourceId", next)}
                />
              )}
              {connection !== "decodo" && connection !== "oxylabs" && (
                <ProviderSelect
                  label={t("providers.protocol")}
                  value={String(values.protocol)}
                  items={[
                    { value: String(ProxyProto_Type.HTTP), label: "HTTP" },
                    { value: String(ProxyProto_Type.SOCKS5), label: "SOCKS5" },
                  ]}
                  onChange={(next) =>
                    update(
                      "protocol",
                      Number(next) as ProviderConnection["protocol"],
                    )
                  }
                  disabled={busy}
                />
              )}
              {fields.includes("limit") && (
                <QuantityField
                  label={t("providers.fields.limit")}
                  value={values.limit}
                  max={MAX_PROVIDER_PROXIES}
                  disabled={busy}
                  onChange={(next) => update("limit", next)}
                />
              )}
              {fields.includes("country") && (
                <SecretField
                  secret={false}
                  label={t("providers.fields.country")}
                  value={values.country}
                  disabled={busy}
                  onChange={(next) => update("country", next.slice(0, 2))}
                />
              )}
            </FieldGroup>
          )}
          {buying && (
            <FieldGroup>
              {uncertain && <UncertainNotice />}
              {orderId && (
                <Notice
                  tone="success"
                  title={t("providers.orderCreatedTitle", { orderId })}
                >
                  {t("providers.orderCreated")}
                </Notice>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={countryId}>
                    {t("providers.orderCountry")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <GlobeIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      id={countryId}
                      value={orderCountry}
                      maxLength={3}
                      disabled={busy}
                      onChange={(event) => {
                        setOrderCountry(event.target.value.toUpperCase());
                        setQuote(null);
                      }}
                    />
                  </InputGroup>
                </Field>
                <QuantityField
                  label={t("providers.quantity")}
                  value={quantity}
                  max={MAX_PROVIDER_PROXIES}
                  disabled={busy}
                  onChange={(next) => {
                    setQuantity(next);
                    setQuote(null);
                  }}
                />
              </div>
              <Field>
                <FieldLabel htmlFor={couponId}>
                  {t("providers.coupon")}
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={couponId}
                    value={coupon}
                    disabled={busy}
                    onChange={(event) => {
                      setCoupon(event.target.value);
                      setQuote(null);
                    }}
                  />
                  {coupon && (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={t("providers.removeCode")}
                        disabled={busy}
                        onClick={() => {
                          setCoupon("");
                          setQuote(null);
                        }}
                      >
                        <XIcon />
                      </InputGroupButton>
                    </InputGroupAddon>
                  )}
                </InputGroup>
                <FieldDescription>
                  {t("providers.sellerPurchaseHelp")}
                </FieldDescription>
              </Field>
            </FieldGroup>
          )}
        </>
      )}
      {stage === "review" && quote && (
        <>
          <SummaryRows
            rows={[
              {
                id: "product",
                label: t("providers.product"),
                value:
                  staticProducts.find((item) => item.value === values.product)
                    ?.label ?? values.product,
              },
              {
                id: "country",
                label: t("providers.orderCountry"),
                value: orderCountry,
              },
              {
                id: "quantity",
                label: t("providers.quantity"),
                value: quantity,
              },
              {
                id: "period",
                label: t("providers.period"),
                value: t("providers.oneMonth"),
              },
              {
                id: "code",
                label: t("providers.coupon"),
                value: coupon || t("providers.noCode"),
              },
              {
                id: "balance",
                label: t("providers.balanceAfter"),
                value: insufficient
                  ? "-"
                  : `${format(subtractAmount(quote.balance, quote.total))} ${quote.currency}`,
              },
              {
                id: "total",
                label: t("providers.total"),
                value: `${format(quote.total)} ${quote.currency}`,
                strong: true,
              },
            ]}
          />
          {insufficient && (
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
        </>
      )}
      {stage === "ordered" && orderId && (
        <>
          <Notice
            tone="success"
            title={t("providers.orderCreatedTitle", { orderId })}
          >
            {t("providers.orderCreated")}
          </Notice>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-foreground/70">{t("providers.orderId")}</span>
            <CopyValue value={orderId} />
          </div>
          <ProviderSelect
            label={t("providers.protocol")}
            value={String(values.protocol)}
            items={[
              { value: String(ProxyProto_Type.HTTP), label: "HTTP" },
              { value: String(ProxyProto_Type.SOCKS5), label: "SOCKS5" },
            ]}
            onChange={(next) =>
              update("protocol", Number(next) as ProviderConnection["protocol"])
            }
            disabled={busy}
          />
        </>
      )}
      {stage === "import" && proxies && (
        <>
          <Notice tone="success">
            {t("providers.preview", { count: proxies.length })}
          </Notice>
          <ul className="border-border bg-card divide-border divide-y rounded-lg border font-mono text-xs select-text">
            {proxies.slice(0, PREVIEW_ROWS).map((proxy) => (
              <li
                key={getProxyKey(proxy)}
                className="flex items-center gap-2 px-3 py-2"
              >
                <ServerIcon
                  aria-hidden
                  className="text-foreground/70 size-3.5 shrink-0"
                />
                <span className="truncate">
                  {proxy.address.replace("inet://", "")}
                </span>
                <span className="text-foreground/70 ml-auto">
                  {proxy.type === ProxyProto_Type.SOCKS5 ? "SOCKS5" : "HTTP"}
                </span>
              </li>
            ))}
          </ul>
          {proxies.length > PREVIEW_ROWS && (
            <p className="text-foreground/70 text-xs">
              {t("providers.previewMore", {
                count: proxies.length - PREVIEW_ROWS,
              })}
            </p>
          )}
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </ProviderFrame>
  );
}
