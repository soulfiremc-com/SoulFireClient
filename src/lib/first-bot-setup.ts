export type FirstBotSetupStep = "server" | "accounts" | "proxies" | "start";

const DISMISSED_PREFIX = "first-bot-setup-dismissed:";

const STARTED_PREFIX = "first-bot-setup-started:";

// Blocked site data makes storage throw. The guide then forgets its state
// instead of breaking the project overview.
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, "true");
  } catch {
    // The guide state lasts for this page view only.
  }
}

export function isFirstBotSetupDismissed(instanceId: string): boolean {
  return readFlag(DISMISSED_PREFIX + instanceId);
}

export function dismissFirstBotSetup(instanceId: string): void {
  writeFlag(DISMISSED_PREFIX + instanceId);
}

/** Remembers an open guide while the user adds accounts on another page. */
export function isFirstBotSetupStarted(instanceId: string): boolean {
  return readFlag(STARTED_PREFIX + instanceId);
}

export function markFirstBotSetupStarted(instanceId: string): void {
  writeFlag(STARTED_PREFIX + instanceId);
}

/**
 * An instance gets the guide when it has no accounts, and keeps it until a bot
 * runs. An existing instance whose bots are stopped goes to the normal overview.
 */
export function shouldShowFirstBotSetup(input: {
  accountCount: number;
  desiredCount: number;
  onlineCount: number;
  dismissed: boolean;
  started: boolean;
}): boolean {
  if (input.dismissed) return false;
  if (input.desiredCount > 0 || input.onlineCount > 0) return false;
  return input.accountCount === 0 || input.started;
}

/**
 * The default address stays usable for local tests, so it does not block the
 * flow. Proxies are optional, so skipping them also completes that step.
 */
export function getFirstBotSetupState(input: {
  address: string;
  defaultAddress: string;
  accountCount: number;
  proxyCount: number;
  proxiesSkipped: boolean;
}): {
  done: Record<FirstBotSetupStep, boolean>;
  nextStep: FirstBotSetupStep;
} {
  const done: Record<FirstBotSetupStep, boolean> = {
    server:
      input.address.trim() !== "" && input.address !== input.defaultAddress,
    accounts: input.accountCount > 0,
    proxies: input.proxyCount > 0 || input.proxiesSkipped,
    start: false,
  };
  const nextStep: FirstBotSetupStep = !done.server
    ? "server"
    : !done.accounts
      ? "accounts"
      : !done.proxies
        ? "proxies"
        : "start";
  return { done, nextStep };
}
