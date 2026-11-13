import { fromJson, type JsonValue } from "@bufbuild/protobuf";
import { MinecraftAccountProto_OnlineSimpleJavaDataSchema } from "@/generated/soulfire/common_pb";
import type { ProfileRoot } from "@/lib/types";

export function serializeProfileFile(profile: ProfileRoot): string {
  return JSON.stringify(
    {
      ...profile,
      accounts: profile.accounts.map((account) => {
        if (account.accountData.case !== "onlineSimpleJavaData") return account;
        return {
          ...account,
          accountData: {
            ...account.accountData,
            value: {
              ...account.accountData.value,
              expireTimeMs: account.accountData.value.expireTimeMs.toString(),
            },
          },
        };
      }),
    },
    null,
    2,
  );
}

export function parseProfileFile(content: string): ProfileRoot {
  const profile = JSON.parse(content) as ProfileRoot;
  return {
    ...profile,
    accounts: profile.accounts.map((account) => {
      if (account.accountData.case !== "onlineSimpleJavaData") return account;
      return {
        ...account,
        accountData: {
          case: "onlineSimpleJavaData",
          value: fromJson(
            MinecraftAccountProto_OnlineSimpleJavaDataSchema,
            account.accountData.value as unknown as JsonValue,
            { ignoreUnknownFields: true },
          ),
        },
      };
    }),
  };
}
