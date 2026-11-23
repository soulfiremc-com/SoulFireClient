import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.tsx";

/// Lets keyboard users jump past the titlebar and sidebar to the page's main landmark.
export function SkipToContent() {
  const { t } = useTranslation("common");

  return (
    <a
      href="#main-content"
      className={cn(
        buttonVariants({ variant: "outline" }),
        "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100",
      )}
      onClick={(event) => {
        // Each layout renders its own main element, so find it when the link is used.
        const main = document.querySelector("main");
        if (!(main instanceof HTMLElement)) return;
        event.preventDefault();
        if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
    >
      {t("skipToContent")}
    </a>
  );
}
