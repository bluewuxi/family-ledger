import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  getLocalAuthBypassUser,
  isLocalAuthBypassRequest,
  LOCAL_AUTH_BYPASS_TOKEN,
  LocalAuthBypassUserNotFoundError
} from "../apps/api/src/auth/localAuthBypass";

const originalEnabled = process.env.FAMILY_LEDGER_LOCAL_AUTH_BYPASS;
const originalEmail = process.env.LOCAL_AUTH_BYPASS_EMAIL;

void main()
  .then(() => {
    console.log("Local auth bypass verification: success");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function main(): Promise<void> {
  try {
    delete process.env.FAMILY_LEDGER_LOCAL_AUTH_BYPASS;
    delete process.env.LOCAL_AUTH_BYPASS_EMAIL;
    assert.equal(isLocalAuthBypassRequest(localEvent(), LOCAL_AUTH_BYPASS_TOKEN), false);

    process.env.FAMILY_LEDGER_LOCAL_AUTH_BYPASS = "true";
    process.env.LOCAL_AUTH_BYPASS_EMAIL = "ricky.yu@outlook.com";
    assert.equal(isLocalAuthBypassRequest(localEvent(), LOCAL_AUTH_BYPASS_TOKEN), true);
    assert.equal(isLocalAuthBypassRequest(localEvent(), "wrong-token"), false);
    assert.equal(isLocalAuthBypassRequest(localEvent({ accountId: "123456789012" }), LOCAL_AUTH_BYPASS_TOKEN), false);
    assert.equal(isLocalAuthBypassRequest(localEvent({ host: "api.example.com" }), LOCAL_AUTH_BYPASS_TOKEN), false);
    assert.equal(isLocalAuthBypassRequest(localEvent({ sourceIp: "203.0.113.10" }), LOCAL_AUTH_BYPASS_TOKEN), false);

    const user = await getLocalAuthBypassUser(localEvent(), LOCAL_AUTH_BYPASS_TOKEN, {
      async findUserByEmail(email) {
        assert.equal(email, "ricky.yu@outlook.com");
        return { id: "11111111-1111-4111-8111-111111111111", email };
      }
    });
    assert.deepEqual(user, {
      id: "11111111-1111-4111-8111-111111111111",
      email: "ricky.yu@outlook.com",
      role: "admin"
    });

    await assert.rejects(
      () =>
        getLocalAuthBypassUser(localEvent(), LOCAL_AUTH_BYPASS_TOKEN, {
          async findUserByEmail() {
            return null;
          }
        }),
      LocalAuthBypassUserNotFoundError
    );
  } finally {
    restoreEnv("FAMILY_LEDGER_LOCAL_AUTH_BYPASS", originalEnabled);
    restoreEnv("LOCAL_AUTH_BYPASS_EMAIL", originalEmail);
  }
}

function localEvent(input: {
  accountId?: string;
  host?: string;
  sourceIp?: string;
} = {}): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: "/me",
    rawQueryString: "",
    headers: {
      host: input.host ?? "127.0.0.1:3000",
      authorization: `Bearer ${LOCAL_AUTH_BYPASS_TOKEN}`
    },
    requestContext: {
      accountId: input.accountId ?? "local",
      apiId: "local",
      domainName: input.host ?? "127.0.0.1:3000",
      domainPrefix: "local",
      http: {
        method: "GET",
        path: "/me",
        protocol: "HTTP/1.1",
        sourceIp: input.sourceIp ?? "127.0.0.1",
        userAgent: "verify-local-auth-bypass"
      },
      requestId: "verify-local-auth-bypass",
      routeKey: "$default",
      stage: "$default",
      time: "18/Jun/2026:00:00:00 +0000",
      timeEpoch: 1781740800000
    },
    isBase64Encoded: false
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
