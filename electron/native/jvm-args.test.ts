import assert from "node:assert/strict";
import { test } from "node:test";
import { findBlockedJvmArg } from "./jvm-args";

test("tuning, memory, and property arguments are allowed", () => {
  assert.equal(
    findBlockedJvmArg([
      "-Xmx4G",
      "-XX:+EnableDynamicAgentLoading",
      "-XX:+UnlockExperimentalVMOptions",
      "-XX:+UseZGC",
      "-Dsf.flags.v2=true",
      "--add-opens=java.base/java.lang=ALL-UNNAMED",
    ]),
    null,
  );
});

test("arguments that load code or replace the jar are blocked", () => {
  for (const arg of [
    "-javaagent:/tmp/agent.jar",
    "-agentpath:/tmp/lib.so",
    "-agentlib:jdwp=transport=dt_socket",
    "-Xrunjdwp:transport=dt_socket,server=y,address=*:5005",
    "-Dcom.sun.management.jmxremote.port=9010",
    "-Dcom.sun.management.jmxremote.authenticate=false",
    "-Dcom.sun.management.config.file=/tmp/management.properties",
    "-XX:OnOutOfMemoryError=calc.exe",
    "-XX:OnError=sh -c id",
    "-XX:Flags=/tmp/flags",
    "-XX:VMOptionsFile=/tmp/options",
    "-Xbootclasspath/a:/tmp/boot.jar",
    "-Djava.system.class.loader=evil.Loader",
    "-cp",
    "--class-path=/tmp",
    "-jar",
    "@/tmp/args.txt",
    "evil.Main",
  ]) {
    assert.equal(findBlockedJvmArg(["-Xmx2G", arg]), arg, arg);
  }
});
