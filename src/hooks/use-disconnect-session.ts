import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { disconnectSession } from "@/lib/web-rpc.ts";

/**
 * Signs out, stops the local server, and opens the start page. A server that
 * does not stop still ends the session, and the user sees a warning.
 */
export function useDisconnectSession() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();

  return async () => {
    const toastId = toast.loading(t("userSidebar.logOutToast.loading"));
    try {
      const { stopError } = await disconnectSession();
      if (stopError === null) {
        toast.success(t("userSidebar.logOutToast.success"), { id: toastId });
      } else {
        toast.warning(t("userSidebar.logOutToast.stopError"), {
          id: toastId,
        });
      }
      await navigate({ to: "/", replace: true });
    } catch (error) {
      console.error(error);
      toast.error(t("userSidebar.logOutToast.error"), { id: toastId });
    }
  };
}
