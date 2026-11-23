import { ConnectError } from "@connectrpc/connect";
import { t } from "i18next";
import { toast } from "sonner";
import { getConnectionErrorKind } from "@/lib/connection-errors.ts";
import { isDemoReadOnlyError } from "@/lib/instance-mutations.ts";

/** Shared id, so repeated demo writes show one notice instead of a stack. */
const DEMO_READ_ONLY_TOAST_ID = "demo-read-only";

export function toastDemoReadOnly() {
  toast.info(t("common:demoReadOnly"), {
    id: DEMO_READ_ONLY_TOAST_ID,
  });
}

/**
 * Explains why a request failed. Connection, sign-in, and permission problems
 * get a fixed hint. Other errors show the server's message, if it sent one.
 */
export function describeError(error: unknown): string | undefined {
  const kind = getConnectionErrorKind(error);
  if (kind !== "unexpected") {
    return t(`common:errorToast.${kind}`);
  }
  if (error instanceof ConnectError) {
    return error.rawMessage || undefined;
  }
  return undefined;
}

/**
 * Shows a failed action. A demo write is skipped, because the mutation cache
 * already showed the demo notice for it.
 */
export function toastError(
  title: string,
  error: unknown,
  options?: { id?: string | number },
) {
  if (isDemoReadOnlyError(error)) return;
  console.error(error);
  toast.error(title, { ...options, description: describeError(error) });
}

/**
 * Like `toast.promise`, for a mutation. A demo write closes the loading toast
 * instead of showing an error, since the demo notice explains it.
 */
export function toastMutation<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string; error: string },
): Promise<T> {
  const id = toast.loading(messages.loading);
  promise.then(
    () => {
      toast.success(messages.success, { id });
    },
    (error: unknown) => {
      if (isDemoReadOnlyError(error)) {
        toast.dismiss(id);
        return;
      }
      toastError(messages.error, error, { id });
    },
  );
  return promise;
}
