import { createClient, type Transport } from "@connectrpc/connect";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ProxyCheckService } from "@/generated/soulfire/proxy-check_pb";
import { checkProxies } from "@/lib/proxy-check";
import type { ProfileProxy } from "@/lib/types";

export function useProxyCheck(
  transport: Transport | null,
  instanceId: string,
  removeFailed: (proxies: ProfileProxy[]) => Promise<unknown>,
) {
  const { t } = useTranslation("instance");
  const current = useRef<{
    abort: AbortController;
    toastId: string | number;
  } | null>(null);
  useEffect(
    () => () => {
      current.current?.abort.abort();
      if (current.current) toast.dismiss(current.current.toastId);
    },
    [transport, instanceId],
  );

  return useCallback(
    (proxies: ProfileProxy[]) => {
      if (!transport || !proxies.length) return;
      current.current?.abort.abort();
      if (current.current) toast.dismiss(current.current.toastId);
      const abort = new AbortController();
      const loading = (progress: { success: number; failed: number }) =>
        t("proxy.checkToast.loading", {
          ...progress,
          checked: progress.success + progress.failed,
          total: proxies.length,
        });
      const cancel = {
        label: t("common:cancel"),
        onClick: () => {
          abort.abort();
          toast.dismiss(toastId);
        },
      };
      const toastId = toast.loading(loading({ success: 0, failed: 0 }), {
        cancel,
      });
      current.current = { abort, toastId };
      const run = async () => {
        try {
          const responses = createClient(ProxyCheckService, transport).check(
            { instanceId, proxy: proxies },
            { signal: abort.signal },
          );
          const result = await checkProxies(
            responses,
            abort.signal,
            removeFailed,
            (progress) => {
              toast.loading(loading(progress), { id: toastId, cancel });
            },
          );
          toast.success(
            t("proxy.checkToast.success", { count: result.failed }),
            { id: toastId, cancel: undefined },
          );
        } catch (error) {
          if (abort.signal.aborted) toast.dismiss(toastId);
          else {
            console.error(error);
            toast.error(t("proxy.checkToast.error"), {
              id: toastId,
              cancel: undefined,
            });
          }
        } finally {
          if (current.current?.abort === abort) current.current = null;
        }
      };
      void run();
    },
    [transport, instanceId, removeFailed, t],
  );
}
