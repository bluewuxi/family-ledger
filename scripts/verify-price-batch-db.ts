import dotenv from "dotenv";
import assert from "node:assert/strict";
import { getSupabaseAdmin } from "../apps/api/src/db/supabaseServer";
import { listLatestPrices } from "../apps/api/src/repositories/priceRepository";
async function main() {
 dotenv.config({path: ".env.test",quiet:true});
 const db=await getSupabaseAdmin();
 const {data,error}=await db.from("instrument_prices").select("instrument_id,currency").limit(10);
 if(error) throw new Error("Could not read price keys.");
 const keys=[...new Map((data??[]).map(row=>[row.instrument_id+row.currency,{instrumentId:row.instrument_id,currency:row.currency}])).values()];
 assert.ok(keys.length);
 const result=await listLatestPrices(keys);
 assert.ok(result.length);
 console.log("Real GET batch-price RPC JSON encoding passed; no records modified.");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Verification failed");process.exitCode=1;});
