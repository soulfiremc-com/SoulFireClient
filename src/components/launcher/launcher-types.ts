import type { SFServerType } from "@/lib/types.ts";

export type LoginType = "INTEGRATED" | "DEDICATED" | "EMAIL_CODE" | null;

export type LoginFunction = (
  type: SFServerType,
  address: string,
  token: string,
) => Promise<void>;

/** An email sign-in waiting for its code. */
export interface AuthFlowData {
  email: string;
  flowToken: string;
  address: string;
  /** When the server sent the code. Codes expire after 15 minutes. */
  sentAt: number;
}
