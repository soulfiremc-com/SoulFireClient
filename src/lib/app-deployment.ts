const APP_HOSTNAMES = {
  production: {
    app: "app.soulfiremc.com",
    demo: "demo.soulfiremc.com",
  },
  preview: {
    app: "preview.soulfiremc.com",
    demo: "preview-demo.soulfiremc.com",
  },
};

export function isDemoHostname(hostname: string) {
  return (
    hostname === APP_HOSTNAMES.production.demo ||
    hostname === APP_HOSTNAMES.preview.demo
  );
}

export function getAppUrl(
  environment: typeof APP_ENVIRONMENT,
  demoMode = false,
) {
  const hosts =
    APP_HOSTNAMES[environment === "preview" ? "preview" : "production"];
  return `https://${hosts[demoMode ? "demo" : "app"]}`;
}
