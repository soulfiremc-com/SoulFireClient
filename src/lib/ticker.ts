interface Ticker {
  timer: ReturnType<typeof setInterval>;
  listeners: Set<() => void>;
}

const tickers = new Map<number, Ticker>();

/**
 * Calls the listener every `intervalMs`. Listeners with the same interval
 * share one timer, so many relative times on a page do not each start one.
 */
export function subscribeToTicker(intervalMs: number, listener: () => void) {
  let ticker = tickers.get(intervalMs);
  if (ticker === undefined) {
    const listeners = new Set<() => void>();
    ticker = {
      listeners,
      timer: setInterval(() => {
        for (const notify of listeners) notify();
      }, intervalMs),
    };
    tickers.set(intervalMs, ticker);
  }
  // A Set ignores duplicates, so wrap the listener to count each subscription.
  const subscription = () => {
    listener();
  };
  ticker.listeners.add(subscription);
  const current = ticker;
  return () => {
    current.listeners.delete(subscription);
    if (current.listeners.size === 0 && tickers.get(intervalMs) === current) {
      clearInterval(current.timer);
      tickers.delete(intervalMs);
    }
  };
}
