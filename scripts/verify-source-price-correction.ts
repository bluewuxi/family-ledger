import assert from "node:assert/strict";
import { SSMClient } from "@aws-sdk/client-ssm";
import { insertInstrumentPriceIfNotExists } from "../apps/jobs/src/repositories/instrumentPriceRepository";

/** Exercise the real repository against synthetic HTTP/RPC transports only. */
async function main() {
  const originalFetch = globalThis.fetch, originalSend = SSMClient.prototype.send;
  process.env.SUPABASE_URL = "https://price.fixture.invalid";
  process.env.AWS_REGION = "ap-southeast-2";
  process.env.SUPABASE_SECRET_KEY_SSM_PARAM = "/fixture/key";
  SSMClient.prototype.send = (async () => ({ Parameter: { Value: "fixture-key" } })) as typeof SSMClient.prototype.send;
  let claims = 0, revisions = 0;
  const row = { id: "fixture-price", instrument_id: "fixture", price_date: "2026-11-02", close_price: "100.0000000000", currency: "USD", provider: "Yahoo Finance", source_symbol: "TEST", is_adjusted: false, is_estimated: false, fetched_at: "2026-11-03T00:00:00Z", created_at: "2026-11-03T00:00:00Z", updated_at: "2026-11-03T00:00:00Z" };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (url.pathname.endsWith("/instrument_prices")) {
      if (method === "POST") return json({ code: "23505", message: "fixture duplicate" }, 409);
      return json(url.searchParams.has("id") ? row : [row]);
    }
    if (url.pathname.endsWith("/ensure_price_acquisition")) return json(null);
    if (url.pathname.endsWith("/claim_price_acquisition")) {
      claims++;
      assert.equal(body.force_retry, true);
      return json([{ source: "yahoo_finance", instrument_id: "fixture", query_kind: "daily_history", target_date: row.price_date, lease_token: "fixture-lease", attempts: 1 }]);
    }
    if (url.pathname.endsWith("/complete_price_acquisition")) {
      revisions++;
      const [price] = body.prices as Array<{ closePrice: string; fetchedAt: string }>;
      row.close_price = price.closePrice; row.fetched_at = price.fetchedAt;
      return json(true);
    }
    throw new Error(`Unexpected synthetic request ${url.pathname}`);
  };
  try {
    const input = { instrumentId: "fixture", priceDate: row.price_date, closePrice: "101.1234567890", currency: "USD" as const, provider: "Yahoo Finance", sourceSymbol: "TEST", fetchedAt: "2026-11-04T00:00:00Z" };
    const corrected = await insertInstrumentPriceIfNotExists(input);
    assert.equal(corrected.record.closePrice, "101.1234567890");
    assert.equal(corrected.inserted, false, "A correction is not a new historical row");
    assert.equal(revisions, 1);
    await insertInstrumentPriceIfNotExists({ ...input, closePrice: "101.123456789", fetchedAt: "2026-11-05T00:00:00Z" });
    assert.equal(claims, 1, "Equivalent decimal values do not create correction work");
    row.provider = "manual";
    await insertInstrumentPriceIfNotExists({ ...input, closePrice: "99", provider: "manual" });
    assert.equal(claims, 1, "Manual rows do not enter automatic correction");
    assert.equal(row.close_price, "101.1234567890");
    console.log("Scheduled duplicate source price correction, exact decimals, unchanged input, and manual protection: passed");
  } finally { globalThis.fetch = originalFetch; SSMClient.prototype.send = originalSend; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
