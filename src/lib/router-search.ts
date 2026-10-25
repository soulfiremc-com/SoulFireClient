import { parseSearchWith, stringifySearchWith } from "@tanstack/react-router";

// nuqs owns per-key decoding, including JSON arrays used by table state.
export const parseUrlSearch: (search: string) => Record<string, unknown> =
  parseSearchWith((value) => value);
export const stringifyUrlSearch = stringifySearchWith(JSON.stringify);
