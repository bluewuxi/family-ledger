import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { handler } from "../apps/api/src/handlers/lambda";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const response = await handler(createEvent("GET", "/health"));

  assert.equal(response.statusCode, 200);
  assert.equal(typeof response.body, "string");
  assert.deepEqual(JSON.parse(response.body), {
    success: true,
    data: {
      status: "ok"
    }
  });

  console.log("API health route verification: success");
}

function createEvent(method: string, path: string): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "local",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "verify-api-health"
      },
      requestId: "verify-api-health",
      routeKey: "$default",
      stage: "$default",
      time: new Date().toUTCString(),
      timeEpoch: Date.now()
    },
    isBase64Encoded: false
  };
}
