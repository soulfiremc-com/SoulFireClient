import { DownloadIcon, LoaderIcon, ShoppingCartIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
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
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import {
  CONNECTION_FIELDS,
  loadProviderProxies,
  MAX_PROVIDER_PROXIES,
  purchaseSellerOrder,
  quoteSellerOrder,
  type ProviderConnection,
  type SellerOrder,
  type SellerQuote,
} from "@/lib/proxy-providers.ts";
import { ProviderApiError } from "@/lib/provider-request.ts";
import {
  PROXY_PROVIDERS,
  type ResourceProvider,
} from "@/lib/resource-providers.ts";
import type { ProfileProxy } from "@/lib/types.ts";

const staticProducts = [
  { value: "ipv4", label: "IPv4" },
  { value: "ipv6", label: "IPv6" },
  { value: "isp", label: "ISP" },
];

export default function ProxyProvidersDialog({
  open,
  onOpenChange,
  onImport,
  canImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (proxies: ProfileProxy[]) => Promise<void>;
  canImport: boolean;
}) {
  const { t } = useTranslation("instance");
  const [providerId, setProviderId] = useState("webshare");
  const [busy, setBusy] = useState(false);
  const provider = PROXY_PROVIDERS.find((entry) => entry.id === providerId)!;
  return (
    <Credenza
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("proxy.getProxies")}</CredenzaTitle>
          <CredenzaDescription>
            {t("providers.proxiesDescription")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="max-h-[65vh] overflow-y-auto">
          <FieldGroup>
            <ProviderSelect
              label={t("providers.provider")}
              value={providerId}
              items={PROXY_PROVIDERS.map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))}
              onChange={setProviderId}
              disabled={busy}
            />
            <ProviderLinks provider={provider} />
            {open && provider.connection && (
              <ProxyConnectionPanel
                key={providerId}
                provider={provider}
                onBusyChange={setBusy}
                onImport={onImport}
                canImport={canImport}
                onImported={() => onOpenChange(false)}
              />
            )}
            {!provider.connection && (
              <FieldDescription>
                {t("providers.proxyFileImport")}
              </FieldDescription>
            )}
            {!canImport && (
              <FieldDescription>{t("providers.demo")}</FieldDescription>
            )}
          </FieldGroup>
        </CredenzaBody>
        <CredenzaFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("common:close")}
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              <ExternalLink href="https://soulfiremc.com/get-proxies?utm_source=soulfire-client" />
            }
          >
            {t("providers.allProviders")}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}

function ProxyConnectionPanel({
  provider,
  onBusyChange,
  onImport,
  onImported,
  canImport,
}: {
  provider: ResourceProvider;
  onBusyChange: (busy: boolean) => void;
  onImport: (proxies: ProfileProxy[]) => Promise<void>;
  onImported: () => void;
  canImport: boolean;
}) {
  const { t } = useTranslation("instance");
  const formId = useId();
  const [action, setAction] = useState("import");
  const [values, setValues] = useState<ProviderConnection>({
    apiKey: "",
    username: "",
    password: "",
    sign: "",
    resourceId: "",
    product:
      provider.connection === "proxyscrape" ? "datacenter_shared" : "ipv4",
    mode: "direct",
    limit: 100,
    country: "",
    protocol:
      provider.connection === "decodo" || provider.connection === "oxylabs"
        ? ProxyProto_Type.HTTP
        : ProxyProto_Type.SOCKS5,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proxies, setProxies] = useState<ProfileProxy[] | null>(null);
  const [quote, setQuote] = useState<SellerQuote | null>(null);
  const [orderCountry, setOrderCountry] = useState("USA");
  const [quantity, setQuantity] = useState(1);
  const [coupon, setCoupon] = useState(provider.coupon ?? "");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [purchaseUncertain, setPurchaseUncertain] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const importing = useRef(false);

  useEffect(
    () => () => {
      controller.current?.abort();
      onBusyChange(false);
    },
    [onBusyChange],
  );

  function update<K extends keyof ProviderConnection>(
    key: K,
    value: ProviderConnection[K],
  ) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setProxies(null);
    setQuote(null);
    setError(null);
  }

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (controller.current || importing.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      await task(request.signal);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof ProviderApiError
            ? t(`providers.errors.${cause.reason}`)
            : t("providers.errors.save"),
        );
    } finally {
      if (controller.current === request) controller.current = null;
      if (!request.signal.aborted) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  const order: SellerOrder = {
    product: values.product as SellerOrder["product"],
    country: orderCountry,
    period: "1m",
    quantity,
    coupon,
  };
  const fields = CONNECTION_FIELDS[provider.connection!];
  const hasCredentials = fields
    .filter((field) => !["limit", "country"].includes(field))
    .every((field) => String(values[field]).trim().length > 0);
  const canLoad =
    hasCredentials && values.limit >= 1 && values.limit <= MAX_PROVIDER_PROXIES;

  return (
    <FieldGroup>
      {provider.connection === "proxy-seller" && (
        <ProviderSelect
          label={t("providers.action")}
          value={action}
          items={[
            { value: "import", label: t("providers.importExisting") },
            { value: "purchase", label: t("providers.buyWithBalance") },
          ]}
          onChange={(next) => {
            setAction(next);
            setError(null);
          }}
          disabled={busy}
        />
      )}
      {fields
        .filter((field) => action !== "purchase" || field === "apiKey")
        .map((field) => (
          <Field key={field}>
            <FieldLabel htmlFor={`${formId}-${field}`}>
              {t(`providers.fields.${field}`)}
            </FieldLabel>
            <Input
              id={`${formId}-${field}`}
              type={
                ["apiKey", "password", "sign"].includes(field)
                  ? "password"
                  : field === "limit"
                    ? "number"
                    : "text"
              }
              autoComplete="off"
              spellCheck={false}
              min={field === "limit" ? 1 : undefined}
              max={field === "limit" ? MAX_PROVIDER_PROXIES : undefined}
              maxLength={field === "country" ? 2 : undefined}
              disabled={busy}
              value={values[field]}
              onChange={(event) => {
                if (field === "limit")
                  update("limit", Number(event.target.value));
                else update(field, event.target.value);
              }}
            />
            {field === "resourceId" && (
              <FieldDescription>
                {t(`providers.resourceHelp.${provider.connection!}`)}
              </FieldDescription>
            )}
          </Field>
        ))}
      {provider.connection === "proxy-seller" && (
        <ProviderSelect
          label={t("providers.product")}
          value={values.product}
          items={staticProducts}
          onChange={(next) => update("product", next)}
          disabled={busy}
        />
      )}
      {action === "import" && (
        <>
          {provider.connection === "webshare" && (
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
          {provider.connection === "proxyscrape" && (
            <>
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
              <FieldDescription>
                {t("providers.proxyscrapeCredentials")}
              </FieldDescription>
            </>
          )}
          {provider.connection !== "decodo" &&
            provider.connection !== "oxylabs" && (
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
          <FieldDescription>
            {t(`providers.scope.${provider.connection!}`)}
          </FieldDescription>
          <Button
            variant="outline"
            disabled={busy || !canLoad || !canImport}
            onClick={() =>
              void run(async (signal) => {
                const result = await loadProviderProxies(
                  provider.connection!,
                  values,
                  signal,
                );
                signal.throwIfAborted();
                setProxies(result);
              })
            }
          >
            {busy ? (
              <LoaderIcon data-icon="inline-start" className="animate-spin" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            {t("providers.loadProxies")}
          </Button>
          {proxies && (
            <>
              <FieldDescription aria-live="polite">
                {t("providers.preview", { count: proxies.length })}
              </FieldDescription>
              <Button
                disabled={busy || !canImport}
                onClick={() =>
                  void run(async () => {
                    importing.current = true;
                    try {
                      await onImport(proxies);
                      onImported();
                    } finally {
                      importing.current = false;
                    }
                  })
                }
              >
                {t("providers.importProxies", { count: proxies.length })}
              </Button>
            </>
          )}
        </>
      )}
      {action === "purchase" && (
        <>
          <Field>
            <FieldLabel htmlFor={`${formId}-order-country`}>
              {t("providers.orderCountry")}
            </FieldLabel>
            <Input
              id={`${formId}-order-country`}
              value={orderCountry}
              maxLength={3}
              disabled={busy}
              onChange={(event) => {
                setOrderCountry(event.target.value.toUpperCase());
                setQuote(null);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-quantity`}>
              {t("providers.quantity")}
            </FieldLabel>
            <Input
              id={`${formId}-quantity`}
              type="number"
              min={1}
              max={MAX_PROVIDER_PROXIES}
              value={quantity}
              disabled={busy}
              onChange={(event) => {
                setQuantity(Number(event.target.value));
                setQuote(null);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-coupon`}>
              {t("providers.coupon")}
            </FieldLabel>
            <Input
              id={`${formId}-coupon`}
              value={coupon}
              disabled={busy}
              onChange={(event) => {
                setCoupon(event.target.value);
                setQuote(null);
              }}
            />
          </Field>
          <FieldDescription>
            {t("providers.sellerPurchaseHelp")}
          </FieldDescription>
          <Button
            variant="outline"
            disabled={
              busy ||
              !values.apiKey.trim() ||
              !/^[A-Z]{3}$/.test(orderCountry) ||
              !Number.isInteger(quantity) ||
              quantity < 1 ||
              quantity > MAX_PROVIDER_PROXIES ||
              orderId !== null ||
              purchaseUncertain ||
              !canImport
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
              })
            }
          >
            {t("providers.checkPrice")}
          </Button>
          {quote && (
            <>
              <FieldDescription aria-live="polite">
                {t("providers.quote", {
                  total: quote.total,
                  balance: quote.balance,
                  currency: quote.currency,
                })}
              </FieldDescription>
              <Button
                disabled={
                  busy ||
                  quote.balance < quote.total ||
                  orderId !== null ||
                  purchaseUncertain ||
                  !canImport
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
                      setAction("import");
                    } catch (cause) {
                      setQuote(null);
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
                {busy ? (
                  <LoaderIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <ShoppingCartIcon data-icon="inline-start" />
                )}
                {t("providers.purchase", {
                  total: quote.total,
                  currency: quote.currency,
                })}
              </Button>
            </>
          )}
        </>
      )}
      {orderId && (
        <FieldDescription aria-live="polite">
          {t("providers.orderCreated", { orderId })}
        </FieldDescription>
      )}
      {purchaseUncertain && (
        <Alert>
          <AlertDescription>
            {t("providers.purchaseUncertain")}
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FieldDescription>{t("providers.keyPrivacy")}</FieldDescription>
    </FieldGroup>
  );
}
