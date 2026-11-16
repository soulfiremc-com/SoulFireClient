import { describe, expect, test } from "bun:test";
import { withDefaultServerScheme } from "./server-address";

describe("withDefaultServerScheme", () => {
  test("adds http to host and port addresses", () => {
    expect(withDefaultServerScheme("localhost:38765")).toBe(
      "http://localhost:38765",
    );
    expect(withDefaultServerScheme(" 192.168.1.5:38765 ")).toBe(
      "http://192.168.1.5:38765",
    );
    expect(withDefaultServerScheme("sf.example.com")).toBe(
      "http://sf.example.com",
    );
  });

  test("keeps addresses that already have a scheme", () => {
    expect(withDefaultServerScheme("https://sf.example.com")).toBe(
      "https://sf.example.com",
    );
    expect(withDefaultServerScheme("HTTP://localhost:38765")).toBe(
      "HTTP://localhost:38765",
    );
  });

  test("leaves an empty address empty so validation reports it", () => {
    expect(withDefaultServerScheme("   ")).toBe("");
  });
});
