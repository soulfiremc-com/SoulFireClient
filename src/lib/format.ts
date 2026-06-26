export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
) {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: opts.month ?? "long",
      day: opts.day ?? "numeric",
      year: opts.year ?? "numeric",
      ...opts,
    }).format(new Date(date));
  } catch (_err) {
    return "";
  }
}

/// Formats a bytes-per-second value into a short human readable string.
export function formatBytesPerSecond(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toFixed(0)} B/s`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB/s`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

/// Formats a number into a compact representation (e.g. 1.2K, 3.4M).
export function formatCompactNumber(value: number): string {
  if (value < 1000) {
    return value.toFixed(0);
  }

  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return `${(value / 1_000_000).toFixed(1)}M`;
}
