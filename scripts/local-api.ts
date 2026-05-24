import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import dotenv from "dotenv";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

const envFile = process.env.FAMILY_LEDGER_ENV_FILE ?? ".env.test";
const port = Number(process.env.LOCAL_API_PORT ?? process.env.PORT ?? "3000");
const host = process.env.LOCAL_API_HOST ?? "127.0.0.1";
const allowedOrigin = process.env.LOCAL_WEB_ORIGIN ?? "http://127.0.0.1:5181";

dotenv.config({ path: envFile, quiet: true });

const handlerPromise = import("../apps/api/src/handlers/lambda").then((module) => module.handler);

const corsHeaders = {
  "access-control-allow-origin": allowedOrigin,
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,accept",
  "access-control-max-age": "86400"
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      writeResponse(response, { statusCode: 204, headers: corsHeaders, body: "" });
      return;
    }

    const event = await toApiGatewayEvent(request);
    const handler = await handlerPromise;
    const result = await handler(event);
    writeResponse(response, withCors(result));
  } catch (error) {
    console.error("Local API adapter error:", error);
    writeResponse(response, {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders },
      body: JSON.stringify({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Local API adapter failed."
        }
      })
    });
  }
});

server.listen(port, host, () => {
  console.log(`family-ledger local API listening at http://${host}:${port}`);
  console.log(`Loaded environment from ${envFile}; CORS origin ${allowedOrigin}`);
});

async function toApiGatewayEvent(request: http.IncomingMessage): Promise<APIGatewayProxyEventV2> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
  const body = await readRequestBody(request);
  const headers = normalizeHeaders(request.headers);

  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: requestUrl.pathname,
    rawQueryString: requestUrl.searchParams.toString(),
    headers,
    queryStringParameters: toQueryStringParameters(requestUrl),
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: request.headers.host ?? `${host}:${port}`,
      domainPrefix: "local",
      http: {
        method: request.method ?? "GET",
        path: requestUrl.pathname,
        protocol: `HTTP/${request.httpVersion}`,
        sourceIp: request.socket.remoteAddress ?? "127.0.0.1",
        userAgent: normalizeHeaderValue(request.headers["user-agent"])
      },
      requestId: randomUUID(),
      routeKey: "$default",
      stage: "$default",
      time: new Date().toUTCString(),
      timeEpoch: Date.now()
    },
    isBase64Encoded: false,
    body: body.length === 0 ? undefined : body
  };
}

function toQueryStringParameters(requestUrl: URL): Record<string, string> | undefined {
  const parameters: Record<string, string> = {};

  for (const [key, value] of requestUrl.searchParams.entries()) {
    parameters[key] = value;
  }

  return Object.keys(parameters).length > 0 ? parameters : undefined;
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(",");
    } else if (value !== undefined) {
      normalized[key.toLowerCase()] = value;
    }
  }

  return normalized;
}

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(",");
  }

  return value ?? "";
}

function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function withCors(result: APIGatewayProxyStructuredResultV2): APIGatewayProxyStructuredResultV2 {
  return {
    ...result,
    headers: {
      ...corsHeaders,
      ...(result.headers ?? {})
    }
  };
}

function writeResponse(response: http.ServerResponse, result: APIGatewayProxyStructuredResultV2): void {
  response.writeHead(result.statusCode ?? 200, result.headers as http.OutgoingHttpHeaders);
  response.end(result.body ?? "");
}
