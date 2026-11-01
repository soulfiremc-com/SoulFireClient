import altsFast from "@/assets/providers/altsfast.webp";
import brightData from "@/assets/providers/brightdata.png";
import decodo from "@/assets/providers/decodo.svg";
import fernan from "@/assets/providers/fernan.webp";
import flameProxies from "@/assets/providers/flameproxies.svg";
import flashProxy from "@/assets/providers/flashproxy.webp";
import iproyal from "@/assets/providers/iproyal.svg";
import kynoSelling from "@/assets/providers/kynoselling.webp";
import legionProxy from "@/assets/providers/legionproxy.png";
import localts from "@/assets/providers/localts.webp";
import oxylabs from "@/assets/providers/oxylabs.png";
import plainProxies from "@/assets/providers/plainproxies.png";
import proxyScrape from "@/assets/providers/proxyscrape.svg";
import proxySeller from "@/assets/providers/proxyseller.webp";
import ravealts from "@/assets/providers/ravealts.webp";
import thordata from "@/assets/providers/thordata.png";
import webshare from "@/assets/providers/webshare.svg";
import { cn } from "@/lib/utils.tsx";

// `fill` logos carry their own background and fill the whole tile.
const LOGOS: Record<string, { src: string; fill?: boolean }> = {
  "alts-fast": { src: altsFast, fill: true },
  "bright-data": { src: brightData, fill: true },
  decodo: { src: decodo },
  fernan: { src: fernan, fill: true },
  flameproxies: { src: flameProxies },
  flashproxy: { src: flashProxy, fill: true },
  iproyal: { src: iproyal },
  kynoselling: { src: kynoSelling, fill: true },
  legionproxy: { src: legionProxy },
  localts: { src: localts, fill: true },
  oxylabs: { src: oxylabs, fill: true },
  plainproxies: { src: plainProxies },
  "proxy-seller": { src: proxySeller },
  proxyscrape: { src: proxyScrape },
  ravealts: { src: ravealts, fill: true },
  thordata: { src: thordata },
  webshare: { src: webshare },
};

export function ProviderLogo({
  providerId,
  className,
}: {
  providerId: string;
  className?: string;
}) {
  const logo = LOGOS[providerId];
  return (
    <span
      data-provider={providerId}
      className={cn(
        "bg-provider-tile ring-foreground/10 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1",
        className,
      )}
    >
      <img
        src={logo.src}
        alt=""
        draggable={false}
        className={cn(
          "size-full",
          logo.fill ? "object-cover" : "object-contain p-1.5",
        )}
      />
    </span>
  );
}
