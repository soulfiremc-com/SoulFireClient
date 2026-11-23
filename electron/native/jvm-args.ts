// JVM options that load code, read more options from files, or open a remote
// debug or management port. The renderer sends user-entered JVM arguments, so
// a compromised renderer could otherwise run code through the integrated
// server.
const BLOCKED_JVM_OPTION_PREFIXES = [
  "-javaagent",
  "-agentlib",
  "-agentpath",
  // -Xrun<library> loads a native agent, for example -Xrunjdwp.
  "-xrun",
  "-dcom.sun.management.jmxremote",
  "-dcom.sun.management.config.file",
  "-xbootclasspath",
  "-xx:onerror",
  "-xx:onoutofmemoryerror",
  "-xx:flags",
  "-xx:vmoptionsfile",
  "-djava.system.class.loader",
  "--patch-module",
  "--upgrade-module-path",
];

// These options take a separate value or replace the SoulFire jar.
const BLOCKED_JVM_OPTIONS = new Set([
  "-jar",
  "-cp",
  "-classpath",
  "--class-path",
  "-p",
  "--module-path",
  "-m",
  "--module",
]);

/** Returns the first argument that the integrated server must not receive. */
export function findBlockedJvmArg(args: readonly string[]): string | null {
  for (const arg of args) {
    const option = arg.toLowerCase();
    if (
      // A value without a leading dash becomes the main class or an argfile.
      !option.startsWith("-") ||
      BLOCKED_JVM_OPTIONS.has(option.split("=")[0] ?? option) ||
      BLOCKED_JVM_OPTION_PREFIXES.some((prefix) => option.startsWith(prefix))
    ) {
      return arg;
    }
  }
  return null;
}
