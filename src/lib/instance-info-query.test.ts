import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { createRouterTransport } from "@connectrpc/connect";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import {
  InstanceConfigSchema,
  InstanceInfoSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import {
  convertFromInstanceProto,
  type InstanceInfoQueryData,
  toSettingsNamespace,
} from "@/lib/types.ts";
import { fetchInstanceInfo } from "./instance-info-query.ts";

const id = "instance";
const queryKey = ["instance-info", id];
const stamp = create(TimestampSchema, { seconds: 1n });
const info = create(InstanceInfoSchema, {
  friendlyName: "Settings QA",
  lastModified: stamp,
  config: create(InstanceConfigSchema, {
    settings: [toSettingsNamespace("plugin", { messages: ["stored"] })],
  }),
});
const cached = { ...info, id, profile: convertFromInstanceProto(info.config) };

function fixture() {
  const client = new QueryClient();
  const conditionalRequests: boolean[] = [];
  const transport = createRouterTransport((router) => {
    router.service(InstanceService, {
      getInstanceInfo(request) {
        conditionalRequests.push(request.ifModifiedSince !== undefined);
        return request.ifModifiedSince
          ? { result: { case: "notModified", value: { lastModified: stamp } } }
          : { result: { case: "info", value: info } };
      },
    });
  });
  const options = queryOptions({
    queryKey,
    queryFn: ({ signal }) => fetchInstanceInfo(transport, id, client, signal),
  });
  return { client, options, conditionalRequests };
}

test("an invalidated optimistic profile is replaced by server state", async () => {
  const { client, options, conditionalRequests } = fixture();
  try {
    client.setQueryData<InstanceInfoQueryData>(queryKey, {
      ...cached,
      profile: {
        ...cached.profile,
        settings: { plugin: { messages: ["rejected"] } },
      },
    });
    await client.invalidateQueries({ queryKey, refetchType: "none" });
    const result = await client.fetchQuery(options);
    assert.deepEqual(result.profile.settings.plugin.messages, ["stored"]);
    assert.deepEqual(conditionalRequests, [false]);
  } finally {
    client.clear();
  }
});

test("unchanged polling preserves cached data with a conditional request", async () => {
  const { client, options, conditionalRequests } = fixture();
  try {
    client.setQueryData(queryKey, cached);
    assert.equal(await client.fetchQuery(options), cached);
    assert.deepEqual(conditionalRequests, [true]);
  } finally {
    client.clear();
  }
});

test("an uncached instance fetch loads its profile", async () => {
  const { client, options, conditionalRequests } = fixture();
  try {
    const result = await client.fetchQuery(options);
    assert.equal(result.id, id);
    assert.deepEqual(result.profile.settings, cached.profile.settings);
    assert.deepEqual(conditionalRequests, [false]);
  } finally {
    client.clear();
  }
});
