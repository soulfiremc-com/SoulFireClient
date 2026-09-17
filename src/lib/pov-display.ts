// Measure the display cadence rather than assuming a high-DPI screen is 60 Hz.
export function povDisplayFps(win: Window): Promise<number> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let last = 0;
    let request = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      win.cancelAnimationFrame(request);
      win.clearTimeout(timeout);
      intervals.sort((a, b) => a - b);
      const interval = intervals[Math.floor(intervals.length / 2)] ?? 16.67;
      const measured = Math.min(120, 1000 / interval);
      resolve(
        [30, 50, 60, 75, 90, 100, 120].reduce((closest, rate) =>
          Math.abs(rate - measured) < Math.abs(closest - measured)
            ? rate
            : closest,
        ),
      );
    };
    const timeout = win.setTimeout(finish, 500);
    const sample = (now: number) => {
      if (done) return;
      if (last) intervals.push(now - last);
      last = now;
      if (intervals.length >= 12) finish();
      else request = win.requestAnimationFrame(sample);
    };
    request = win.requestAnimationFrame(sample);
  });
}

export async function povCodecs(): Promise<string[]> {
  const supported = async (codec: string) => {
    try {
      return (
        await VideoDecoder.isConfigSupported({
          codec,
          optimizeForLatency: true,
        })
      ).supported;
    } catch {
      return false;
    }
  };
  const codecs: string[] = [];
  if (await supported("avc1.640034")) {
    if (
      localStorage.getItem("soulfire.pov.codec") === "av1" &&
      (await supported("av01.0.13M.08"))
    )
      codecs.push("av1");
    codecs.push("h264-high");
  }
  codecs.push("h264-baseline");
  return codecs;
}
