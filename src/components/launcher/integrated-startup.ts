import { getIntegratedRunOptions } from "@/components/launcher/integrated-settings.ts";
import { desktop } from "@/lib/desktop.ts";
import { createIntegratedStartup } from "@/lib/integrated-startup.ts";

/**
 * The app has one local server, so all launcher screens share one startup.
 * It outlives the launcher, so a startup cannot run twice after a remount.
 */
export const integratedStartup = createIntegratedStartup({
  kill: () => desktop.integratedServer.kill(),
  run: () => {
    const options = getIntegratedRunOptions(localStorage);
    if (options === null) {
      return Promise.reject(new Error("No custom server jar is selected"));
    }
    return desktop.integratedServer.run(options);
  },
});
