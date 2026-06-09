import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { AccountTypeCredentials } from "@/generated/soulfire/common_pb.ts";
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

export type RavealtsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportAccounts: (
    payload: string[],
    credentialType: AccountTypeCredentials,
  ) => void;
};

export default function RavealtsDialog({
  open,
  onOpenChange,
  onImportAccounts,
}: RavealtsDialogProps) {
  const { t } = useTranslation("instance");
  const accountTypeSelectId = useId();
  const [apiKey, setApiKey] = useState(() => getRavealtsApiKey());
  const [showApiKey, setShowApiKey] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [validating, setValidating] = useState(false);
  const [stock, setStock] = useState<RavealtsStock | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");
  const [amount, setAmount] = useState(1);
  const [purchasing, setPurchasing] = useState(false);

  const availableTypes =
    stock !== null
      ? Object.entries(stock).filter(([, count]) => count > 0)
      : [];
  const accountTypeItems = availableTypes.map(([type, count]) => ({
    label: `${formatStockType(type)} (${count})`,
    value: type,
  }));

  const loadStock = useCallback(async () => {
    setLoadingStock(true);
    try {
      const result = await fetchStock();
      setStock(result.stock);
    } catch {
      toast.error(t("account.ravealts.networkError"));
    } finally {
      setLoadingStock(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) {
      void loadStock();
    }
  }, [open, loadStock]);

  const handleValidate = async () => {
    if (apiKey.trim().length === 0) return;

    setValidating(true);
    try {
      const result = await fetchKeyInfo(apiKey.trim());
      setCredits(result.available_credits);
      setRavealtsApiKey(apiKey.trim());
      toast.success(t("account.ravealts.keyValid"));
    } catch (e) {
      setCredits(null);
      if (e instanceof RavealtsApiError) {
        toast.error(t("account.ravealts.keyInvalid"));
      } else {
        toast.error(t("account.ravealts.networkError"));
      }
    } finally {
      setValidating(false);
    }
  };

  const handlePurchase = async () => {
    if (selectedType === "" || credits === null) return;

    setPurchasing(true);
    try {
      const result = await purchaseAccounts(
        apiKey.trim(),
        selectedType,
        amount,
      );
      const { payload, credentialType } = mapPurchasedAccounts(result.accounts);

      toast.success(
        t("account.ravealts.purchaseSuccess", {
          count: result.accounts.length,
        }),
      );

      onImportAccounts(payload, credentialType);
      void loadStock();

      // Refresh credits
      try {
        const keyInfo = await fetchKeyInfo(apiKey.trim());
        setCredits(keyInfo.available_credits);
      } catch {
        // Ignore, credits will be stale
      }
    } catch (e) {
      if (e instanceof RavealtsApiError) {
        switch (e.errorType) {
          case "rate_limited":
            toast.error(t("account.ravealts.rateLimited"));
            break;
          case "insufficient_balance":
            toast.error(t("account.ravealts.insufficientBalance"));
            break;
          case "out_of_stock":
            toast.error(t("account.ravealts.outOfStock"));
            break;
          default:
            toast.error(
              t("account.ravealts.purchaseError", { message: e.message }),
            );
        }
      } else {
        toast.error(t("account.ravealts.networkError"));
      }
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("account.ravealts.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("account.ravealts.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="flex flex-col gap-4 pb-4 md:pb-0">
          <Field>
            <FieldLabel>{t("account.ravealts.apiKeyLabel")}</FieldLabel>
            <div className="flex gap-2">
              <InputGroup className="flex-1">
                <InputGroupInput
                  type={showApiKey ? "text" : "password"}
                  placeholder={t("account.ravealts.apiKeyPlaceholder")}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleValidate()}
                disabled={validating || apiKey.trim().length === 0}
              >
                {validating ? (
                  <>
                    <LoaderIcon className="size-4 animate-spin" />
                    {t("account.ravealts.validating")}
                  </>
                ) : (
                  t("account.ravealts.validate")
                )}
              </Button>
            </div>
            {credits !== null && (
              <p className="text-muted-foreground text-sm">
                {t("account.ravealts.credits", { credits })}
              </p>
            )}
          </Field>

          <Field>
            <FieldLabel>{t("account.ravealts.stockTitle")}</FieldLabel>
            {loadingStock ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <LoaderIcon className="size-4 animate-spin" />
              </div>
            ) : availableTypes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("account.ravealts.noStock")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTypes.map(([type, count]) => (
                  <span
                    key={type}
                    className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs"
                  >
                    {formatStockType(type)}: {count}
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor={accountTypeSelectId}>
              {t("account.ravealts.accountType")}
            </FieldLabel>
            <Select
              value={selectedType}
              onValueChange={(value) => {
                if (value) {
                  setSelectedType(value);
                }
              }}
              disabled={availableTypes.length === 0}
              items={accountTypeItems}
            >
              <SelectTrigger id={accountTypeSelectId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t("account.ravealts.accountType")}</SelectLabel>
                  {accountTypeItems.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>{t("account.ravealts.amount")}</FieldLabel>
            <Input
              type="number"
              min={1}
              max={10}
              value={amount}
              onChange={(e) =>
                setAmount(
                  Math.max(
                    1,
                    Math.min(10, Number.parseInt(e.target.value, 10) || 1),
                  ),
                )
              }
            />
          </Field>
        </CredenzaBody>
        <CredenzaFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common:cancel")}
          </Button>
          <Button
            onClick={() => void handlePurchase()}
            disabled={
              purchasing ||
              selectedType === "" ||
              credits === null ||
              amount < 1 ||
              amount > 10
            }
          >
            {purchasing ? (
              <>
                <LoaderIcon className="size-4 animate-spin" />
                {t("account.ravealts.purchasing")}
              </>
            ) : (
              t("account.ravealts.purchase")
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
