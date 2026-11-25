import { test } from "node:test";
import assert from "node:assert/strict";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../proxy";

test("the public screening page skips the session proxy, but its actions and account page keep it", () => {
  const matches = (url: string, headers?: Record<string, string>) =>
    unstable_doesMiddlewareMatch({ config, nextConfig: {}, url, headers });

  assert.equal(matches("/services/screening"), false);
  assert.equal(matches("/services/screening?type=ai_screening", { rsc: "1" }), false);
  assert.equal(matches("/services/screening", { "next-action": "example" }), true);
  assert.equal(matches("/reports/new"), true);
  assert.equal(matches("/orders/example"), true);
});
