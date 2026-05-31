import assert from "node:assert/strict";
import {
  TRADING_PASSWORD_GATE_EMPTY_VALUE,
  TRADING_PASSWORD_PLACEHOLDER,
  createGateSignature,
  getTradingPasswordParameterName,
  verifyGateSignature
} from "../apps/api/src/services/accountTradingPasswordService";

process.env.TRADING_PASSWORD_SSM_PREFIX = "/family-ledger/test_trading_account_password_";

const accountId = "11111111-2222-4333-8444-555555555555";

async function main(): Promise<void> {
  assert.equal(
    getTradingPasswordParameterName(accountId),
    "/family-ledger/test_trading_account_password_11111111-2222-4333-8444-555555555555"
  );

  const signature = await createGateSignature("extra-password");
  const signatureParts = signature.split(":");

  assert.equal(signatureParts.length, 4);
  assert.equal(`${signatureParts[0]}:${signatureParts[1]}`, "scrypt:v1");
  assert.equal(Buffer.from(signatureParts[2] ?? "", "base64url").length, 16);
  assert.equal(Buffer.from(signatureParts[3] ?? "", "base64url").length, 64);
  assert.notEqual(signature, "f5ded19a6388981c8f85c92a87958180");
  assert.equal(await verifyGateSignature("extra-password", signature), true);
  assert.equal(await verifyGateSignature("wrong-password", signature), false);
  assert.equal(await verifyGateSignature("extra-password", "f5ded19a6388981c8f85c92a87958180"), true);
  assert.equal(await verifyGateSignature("wrong-password", "f5ded19a6388981c8f85c92a87958180"), false);
  assert.equal(TRADING_PASSWORD_PLACEHOLDER, "尚未设置交易密码");
  assert.equal(TRADING_PASSWORD_GATE_EMPTY_VALUE, "empty");

  console.log("Account trading password verification: success");
}

void main();
