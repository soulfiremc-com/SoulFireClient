export function getBuildEnvironment(env: {
  CF_PAGES?: string;
  CF_PAGES_BRANCH?: string;
  NODE_ENV?: string;
}): typeof APP_ENVIRONMENT {
  if (env.CF_PAGES === "1") {
    return env.CF_PAGES_BRANCH === "release" || env.CF_PAGES_BRANCH === "demo"
      ? "production"
      : "preview";
  }

  const environment = env.NODE_ENV;
  return environment === "production" || environment === "preview"
    ? environment
    : "development";
}
