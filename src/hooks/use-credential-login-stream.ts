import { use, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { type ExternalToast, toast } from "sonner";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import type { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import { MCAuthService } from "@/generated/soulfire/mc-auth_pb";
import {
  type CredentialLoginProgress,
  type CredentialLoginResult,
  collectCredentialLogins,
} from "@/lib/credential-login-stream.ts";
import { createRpcClient } from "@/lib/rpc";

export interface CredentialLoginOptions {
  instanceId: string;
  service: AccountTypeCredentials;
  payload: string[];
  progressMessage: (progress: CredentialLoginProgress) => string;
  /**
   * Runs once for every outcome, with the accounts that signed in so far.
   * The loading toast is still open under toastId unless the user canceled
   * it, so replace it with the final message.
   */
  onSettled: (
    result: CredentialLoginResult,
    toastId: string | number,
  ) => void | Promise<void>;
}

export interface CredentialLoginHandle {
  toastId: string | number;
  cancel: () => void;
}

/**
 * Signs in credentials through the server and shows the progress in a
 * cancelable loading toast. Returns null without a server connection.
 */
export function useCredentialLoginStream() {
  const transport = use(TransportContext);
  const { t } = useTranslation("common");

  return useCallback(
    (options: CredentialLoginOptions): CredentialLoginHandle | null => {
      if (transport === null) return null;

      const service = createRpcClient(MCAuthService, transport);
      const total = options.payload.length;
      let cancel = () => {};
      const loadingData: ExternalToast = {
        cancel: {
          label: t("cancel"),
          onClick: () => {
            cancel();
          },
        },
      };
      const toastId = toast.loading(
        options.progressMessage({ checked: 0, total, success: 0, failed: 0 }),
        loadingData,
      );
      const job = collectCredentialLogins(
        (signal) =>
          service.loginCredentials(
            {
              instanceId: options.instanceId,
              service: options.service,
              payload: options.payload,
            },
            { signal },
          ),
        total,
        (progress) => {
          toast.loading(options.progressMessage(progress), {
            id: toastId,
            ...loadingData,
          });
        },
      );
      cancel = job.cancel;

      void job.result.then(async (result) => {
        if (result.outcome !== "cancelled") {
          // Saving can take a moment and cannot be canceled.
          toast.loading(
            options.progressMessage({
              checked: result.accounts.length + result.failed,
              total,
              success: result.accounts.length,
              failed: result.failed,
            }),
            { id: toastId, cancel: undefined },
          );
        }
        try {
          await options.onSettled(result, toastId);
        } catch (error) {
          console.error(error);
        }
      });

      return { toastId, cancel: job.cancel };
    },
    [transport, t],
  );
}
