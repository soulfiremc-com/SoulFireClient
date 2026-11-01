export type ProxyProviderId =
  | "webshare"
  | "proxy-seller"
  | "proxyscrape"
  | "iproyal"
  | "decodo"
  | "oxylabs"
  | "thordata";

export type ResourceProvider = {
  id: string;
  name: string;
  url: string;
  coupon?: string;
  connection?: ProxyProviderId;
  docs?: string;
};

// Keep referral identifiers aligned with soulfiremc.com provider listings.
export const PROXY_PROVIDERS: ResourceProvider[] = [
  {
    id: "webshare",
    name: "Webshare",
    url: "https://www.webshare.io/?referral_code=36gneippfiwt&utm_source=soulfire-client",
    connection: "webshare",
    docs: "https://apidocs.webshare.io/proxy-list/list",
  },
  {
    id: "proxy-seller",
    name: "Proxy-Seller",
    url: "https://proxy-seller.com/?partner=GRJY71PA3XWPPP&utm_source=soulfiremc&utm_medium=referral&utm_campaign=partner_promo",
    coupon: "SOULFIREMC",
    connection: "proxy-seller",
    docs: "https://docs.proxy-seller.com/api-v2/authorization",
  },
  {
    id: "proxyscrape",
    name: "ProxyScrape",
    url: "https://proxyscrape.com/?ref=mge4mtc&utm_source=soulfire-client",
    connection: "proxyscrape",
    docs: "https://docs.proxyscrape.com/api/account/authentication",
  },
  {
    id: "iproyal",
    name: "IPRoyal",
    url: "https://iproyal.com/?r=soulfire&utm_source=soulfire-client",
    connection: "iproyal",
    docs: "https://docs.iproyal.com/proxies/isp/api",
  },
  {
    id: "decodo",
    name: "Decodo",
    url: "https://visit.decodo.com/K0rr7e?utm_source=soulfire-client",
    connection: "decodo",
    docs: "https://help.decodo.com/api-reference/endpoints/generate-custom-back-connect-endpoints",
  },
  {
    id: "oxylabs",
    name: "Oxylabs",
    url: "https://oxylabs.go2cloud.org/aff_c?offer_id=7&aff_id=1896&url_id=144&utm_source=soulfire-client",
    connection: "oxylabs",
    docs: "https://developers.oxylabs.io/products/proxies/dedicated-datacenter-proxies/enterprise/proxy-lists",
  },
  {
    id: "thordata",
    name: "Thordata",
    url: "https://affiliate.thordata.com/soulfire?utm_source=soulfire-client",
    coupon: "THORDATA",
    connection: "thordata",
    docs: "https://doc.thordata.com/interface-documentation/public-api-new/instructions-for-use",
  },
  {
    id: "bright-data",
    name: "Bright Data",
    url: "https://get.brightdata.com/soulfire?utm_source=soulfire-client",
  },
  {
    id: "legionproxy",
    name: "LegionProxy",
    url: "https://legionproxy.io/?utm_source=github&utm_campaign=soulfire",
  },
  {
    id: "plainproxies",
    name: "PlainProxies",
    url: "https://dashboard.plainproxies.com/?ref=wTOIS7dS&utm_source=soulfire-client",
  },
  {
    id: "flameproxies",
    name: "FlameProxies",
    url: "https://flameproxies.com/register?referral=42M1SH76&utm_source=soulfire-client",
  },
  {
    id: "flashproxy",
    name: "FlashProxy",
    url: "https://flashproxy.com/auth/register?r=3iBXdeFq44ez75bmNsOr6P04l4x1&utm_source=soulfire-client",
  },
];

export const ACCOUNT_PROVIDERS: ResourceProvider[] = [
  {
    id: "ravealts",
    name: "Ravealts",
    url: "https://dash.ravealts.com",
    coupon: "SOULFIRE",
  },
  {
    id: "fernan",
    name: "Fernan's Club",
    url: "https://fernan.club",
    coupon: "SOULFIRE",
    docs: "https://fernan.club/api",
  },
  {
    id: "localts",
    name: "Localts",
    url: "https://localts.store/?campaign=soulfire",
    docs: "https://localts.store/api-docs",
  },
  {
    id: "alts-fast",
    name: "Alts.fast",
    url: "https://alts.fast/?referral=SOULFIRE",
  },
  {
    id: "kynoselling",
    name: "KynoSelling",
    url: "https://kynoselling.xyz/?ref=SOULFIRE",
    coupon: "SOULFIRE10",
  },
];
