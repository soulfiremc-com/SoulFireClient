import { SecureRandom } from "effect/crypto";

export function newCastRequestId(): string {
  // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Cast requires a secure UUIDv4, which Effect v4 provides through its crypto module
  return SecureRandom.uuidV4Unsafe();
}
