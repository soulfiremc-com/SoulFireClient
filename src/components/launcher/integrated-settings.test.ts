import { expect, test } from "bun:test";
import {
  CUSTOM_JAR_ID_KEY,
  DEFAULT_JVM_ARGS,
  JAR_SOURCE_KEY,
  JVM_ARGS_KEY,
  SOFTWARE_RENDERING_KEY,
  getIntegratedJarSource,
  getIntegratedRunOptions,
} from "./integrated-settings";

const storage = (values: Record<string, string>) => ({
  getItem: (key: string) => values[key] ?? null,
});

test("the official jar is the default", () => {
  expect(getIntegratedJarSource(storage({}))).toEqual({ type: "official" });
  expect(
    getIntegratedJarSource(
      storage({ [JAR_SOURCE_KEY]: "official", [CUSTOM_JAR_ID_KEY]: "a" }),
    ),
  ).toEqual({ type: "official" });
});

test("a custom source without a jar does not fall back to the official jar", () => {
  expect(getIntegratedJarSource(storage({ [JAR_SOURCE_KEY]: "custom" }))).toBe(
    null,
  );
  expect(
    getIntegratedRunOptions(
      storage({ [JAR_SOURCE_KEY]: "custom", [CUSTOM_JAR_ID_KEY]: "" }),
    ),
  ).toBe(null);
  expect(
    getIntegratedJarSource(
      storage({ [JAR_SOURCE_KEY]: "custom", [CUSTOM_JAR_ID_KEY]: "jar-1" }),
    ),
  ).toEqual({ type: "custom", jarId: "jar-1" });
});

test("run options use saved arguments or the defaults", () => {
  expect(getIntegratedRunOptions(storage({}))?.jvmArgs).toEqual(
    DEFAULT_JVM_ARGS.split(" "),
  );
  expect(
    getIntegratedRunOptions(
      storage({
        [JVM_ARGS_KEY]: "  -Xmx2G\n -Dfoo=bar ",
        [SOFTWARE_RENDERING_KEY]: "true",
      }),
    ),
  ).toEqual({
    forceSoftwareRendering: true,
    jarSource: { type: "official" },
    jvmArgs: ["-Xmx2G", "-Dfoo=bar"],
  });
});
