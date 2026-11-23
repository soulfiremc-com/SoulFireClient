import { use, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ExternalToast, toast } from "sonner";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import type { AccountTypeDeviceCode } from "@/generated/soulfire/common_pb";
import { MCAuthService } from "@/generated/soulfire/mc-auth_pb";
import { getConnectionErrorKind } from "@/lib/connection-errors.ts";
import {
  type DeviceCodeData,
  type DeviceCodeLoginJob,
  watchDeviceCodeLogin,
} from "@/lib/device-code-login.ts";
import { createRpcClient } from "@/lib/rpc";
import type { ProfileAccount } from "@/lib/types.ts";

/**
 * Runs a device code sign-in with a cancelable loading toast. `code` holds
 * the code to show while the server waits for the user. Canceling the toast
 * or closing the code dialog stops the sign-in. Leaving the page does not,
 * so a code the user already entered still signs in.
 */
export function useDeviceCodeLogin({
  instanceId,
  saveAccount,
  successToast,
}: {
  instanceId: string;
  saveAccount: (account: ProfileAccount) => Promise<void>;
  successToast: ExternalToast;
}) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const [code, setCode] = useState<DeviceCodeData | null>(null);
  const activeJob = useRef<DeviceCodeLoginJob | null>(null);

  const cancel = useCallback(() => {
    activeJob.current?.cancel();
  }, []);

  const save = useCallback(
    (account: ProfileAccount, toastId: string | number) => {
      const attempt = async () => {
        toast.loading(t("account.deviceCodeImportToast.saving"), {
          id: toastId,
          cancel: undefined,
        });
        try {
          await saveAccount(account);
          toast.success(t("account.deviceCodeImportToast.success"), {
            ...successToast,
            id: toastId,
            cancel: undefined,
          });
        } catch (error) {
          console.error(error);
          // The account already signed in, so offer the save again instead
          // of making the user sign in from the start.
          toast.error(t("account.deviceCodeImportToast.saveError"), {
            id: toastId,
            cancel: undefined,
            description: t(
              `account.listImportToast.errorReason.${getConnectionErrorKind(error)}`,
            ),
            duration: Infinity,
            closeButton: true,
            action: {
              label: t("account.deviceCodeImportToast.retrySave"),
              onClick: () => {
                void attempt();
              },
            },
          });
        }
      };
      return attempt();
    },
    [saveAccount, successToast, t],
  );

  const start = useCallback(
    (type: AccountTypeDeviceCode) => {
      if (transport === null) {
        toast.info(t("account.import.demo"));
        return;
      }

      activeJob.current?.cancel();
      const service = createRpcClient(MCAuthService, transport);
      const job = watchDeviceCodeLogin(
        (signal) =>
          service.loginDeviceCode({ instanceId, service: type }, { signal }),
        setCode,
      );
      activeJob.current = job;
      const toastId = toast.loading(
        t("account.deviceCodeImportToast.loading"),
        {
          cancel: { label: t("common:cancel"), onClick: job.cancel },
        },
      );

      void job.result.then(async (result) => {
        if (activeJob.current === job) {
          activeJob.current = null;
          setCode(null);
        }
        switch (result.outcome) {
          case "cancelled": {
            toast.dismiss(toastId);
            break;
          }
          case "error": {
            console.error(result.error);
            toast.error(t("account.deviceCodeImportToast.error"), {
              id: toastId,
              cancel: undefined,
              description: t(
                `account.listImportToast.errorReason.${getConnectionErrorKind(result.error)}`,
              ),
            });
            break;
          }
          case "account": {
            await save(result.account, toastId);
            break;
          }
        }
      });
    },
    [instanceId, save, t, transport],
  );

  return { code, start, cancel };
}
