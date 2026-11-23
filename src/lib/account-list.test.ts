import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProto_OfflineJavaDataSchema,
  SettingsNamespaceSchema,
} from "@/generated/soulfire/common_pb";
import type { ProfileAccount } from "@/lib/types.ts";
import { keepExistingAccountState, mergeAccounts } from "./account-list.ts";

const account = (
  profileId: string,
  lastKnownName = profileId,
): ProfileAccount => ({
  type: MinecraftAccountProto_AccountTypeProto.OFFLINE,
  profileId,
  lastKnownName,
  accountData: {
    case: "offlineJavaData",
    value: create(MinecraftAccountProto_OfflineJavaDataSchema),
  },
  config: [],
  persistentMetadata: [],
});

test("reimport replaces a UUID in place and keeps unrelated accounts", () => {
  const original = account("first");
  const other = account("other");
  const replacement = account("first", "renamed");
  const existing = [original, other];
  assert.deepEqual(mergeAccounts(existing, [replacement]), [
    replacement,
    other,
  ]);
  assert.deepEqual(existing, [original, other]);
});

test("repeated incoming UUIDs use the last account without changing insertion order", () => {
  const existing = account("existing");
  const first = account("new");
  const other = account("other");
  const replacement = account("new", "latest");
  const incoming = [first, other, replacement, existing];
  assert.deepEqual(mergeAccounts([existing], incoming), [
    existing,
    replacement,
    other,
  ]);
  assert.deepEqual(incoming, [first, other, replacement, existing]);
});

test("re-import keeps saved config and metadata when the sign-in returns none", () => {
  const config = [create(SettingsNamespaceSchema, { namespace: "bot" })];
  const metadata = [create(SettingsNamespaceSchema, { namespace: "notes" })];
  const saved = { ...account("first"), config, persistentMetadata: metadata };
  const signedIn = account("first", "renamed");

  const kept = keepExistingAccountState([saved], [signedIn]);
  assert.deepEqual(kept, [
    { ...signedIn, config, persistentMetadata: metadata },
  ]);
  assert.deepEqual(mergeAccounts([saved], [signedIn]), kept);
});

test("re-import uses incoming config and metadata when they are present", () => {
  const saved = {
    ...account("first"),
    config: [create(SettingsNamespaceSchema, { namespace: "old" })],
  };
  const incoming = {
    ...account("first"),
    config: [create(SettingsNamespaceSchema, { namespace: "new" })],
  };
  assert.deepEqual(keepExistingAccountState([saved], [incoming]), [incoming]);
  const fresh = account("other");
  assert.equal(keepExistingAccountState([saved], [fresh])[0], fresh);
});
