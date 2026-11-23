import type { DesktopIntegratedServerJarSource } from "@/lib/desktop-api.ts";

export const AUTO_START_KEY = "auto-start-integrated-server";
export const SOFTWARE_RENDERING_KEY = "force-software-rendering";
export const JVM_ARGS_KEY = "form-integrated-server-jvm-args";
export const JAR_SOURCE_KEY = "form-integrated-server-jar-source";
export const CUSTOM_JAR_ID_KEY = "form-integrated-server-custom-jar-id";

export const DEFAULT_JVM_ARGS = [
  "-XX:+EnableDynamicAgentLoading",
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+UseZGC",
  "-XX:+UseCompactObjectHeaders",
  "-XX:+AlwaysActAsServerClassMachine",
  "-XX:+UseNUMA",
  "-XX:+UseFastUnorderedTimeStamps",
  "-XX:+UseVectorCmov",
  "-XX:+UseCriticalJavaThreadPriority",
  "-Dsf.flags.v2=true",
].join(" ");

type SettingsStorage = Pick<Storage, "getItem">;

/**
 * The jar the local server starts with. Choosing "custom" without a jar
 * returns null: the launcher then asks for a jar instead of quietly starting
 * the official server. The settings screen and auto-start both use this rule.
 */
export function getIntegratedJarSource(
  storage: SettingsStorage,
): DesktopIntegratedServerJarSource | null {
  if (storage.getItem(JAR_SOURCE_KEY) !== "custom") return { type: "official" };
  const jarId = storage.getItem(CUSTOM_JAR_ID_KEY);
  return jarId ? { type: "custom", jarId } : null;
}

/** Start options from the saved launcher settings, or null if no jar is ready. */
export function getIntegratedRunOptions(storage: SettingsStorage) {
  const jarSource = getIntegratedJarSource(storage);
  if (jarSource === null) return null;
  const jvmArgs = storage.getItem(JVM_ARGS_KEY) ?? DEFAULT_JVM_ARGS;
  return {
    forceSoftwareRendering: storage.getItem(SOFTWARE_RENDERING_KEY) === "true",
    jarSource,
    jvmArgs: jvmArgs.split(/\s+/u).filter((arg) => arg !== ""),
  };
}
