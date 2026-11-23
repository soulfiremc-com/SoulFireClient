import type { ConnectError } from "@connectrpc/connect";
import type { Stream } from "effect";
import type { CredentialsAuthResponse } from "@/generated/soulfire/mc-auth_pb";
import { observeServerStream } from "@/lib/protobuf.ts";
import type { ProfileAccount } from "@/lib/types.ts";

export interface CredentialLoginProgress {
  checked: number;
  total: number;
  success: number;
  failed: number;
}

export type CredentialLoginOutcome = "complete" | "cancelled" | "error";

export interface CredentialLoginResult {
  outcome: CredentialLoginOutcome;
  /** Accounts that signed in, including those from before a cancel or error. */
  accounts: ProfileAccount[];
  failed: number;
  error?: unknown;
}

export interface CredentialLoginJob {
  result: Promise<CredentialLoginResult>;
  cancel: () => void;
}

/**
 * Reads one credential login stream and counts its results. The job settles
 * once: when the server sends "end", when cancel() runs, or when the stream
 * fails or closes early. Every outcome keeps the accounts that already signed
 * in, so the caller can save them.
 */
export function collectCredentialLogins(
  open: (
    signal: AbortSignal,
  ) => Stream.Stream<CredentialsAuthResponse, ConnectError>,
  total: number,
  onProgress: (progress: CredentialLoginProgress) => void,
): CredentialLoginJob {
  const controller = new AbortController();
  const accounts: ProfileAccount[] = [];
  let success = 0;
  let failed = 0;
  let settled = false;
  // The Promise executor runs at once, so this is set before any use.
  let resolveResult: ((result: CredentialLoginResult) => void) | undefined;
  const result = new Promise<CredentialLoginResult>((resolve) => {
    resolveResult = resolve;
  });
  const finish = (outcome: CredentialLoginOutcome, error?: unknown) => {
    if (settled) return;
    settled = true;
    resolveResult?.({
      outcome,
      accounts: [...accounts],
      failed,
      ...(error === undefined ? {} : { error }),
    });
  };
  const report = () => {
    onProgress({ checked: success + failed, total, success, failed });
  };

  void observeServerStream(open(controller.signal), {
    onMessage: (response) => {
      if (settled) return;
      const data = response.data;
      switch (data.case) {
        case "oneSuccess": {
          if (data.value.account) accounts.push(data.value.account);
          success++;
          report();
          break;
        }
        case "oneFailure": {
          failed++;
          report();
          break;
        }
        case "end": {
          finish("complete");
          break;
        }
        case undefined: {
          break;
        }
      }
    },
    onError: (error) => {
      finish("error", error);
    },
  }).then(() => {
    // A stream that closes without "end" did not finish its work.
    finish(controller.signal.aborted ? "cancelled" : "error");
  });

  return {
    result,
    cancel: () => {
      controller.abort();
      finish("cancelled");
    },
  };
}
