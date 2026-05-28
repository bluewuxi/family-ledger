import assert from "node:assert/strict";
import {
  TRADING_PASSWORD_GATE_EMPTY_VALUE,
  TRADING_PASSWORD_PLACEHOLDER,
  createGateSignature,
  getTradingPasswordParameterName
} from "../apps/api/src/services/accountTradingPasswordService";

process.env.TRADING_PASSWORD_SSM_PREFIX = "/family-ledger/test_trading_account_password_";

const accountId = "11111111-2222-4333-8444-555555555555";

assert.equal(
  getTradingPasswordParameterName(accountId),
  "/family-ledger/test_trading_account_password_11111111-2222-4333-8444-555555555555"
);
assert.equal(createGateSignature("extra-password"), "f5ded19a6388981c8f85c92a87958180");
assert.equal(TRADING_PASSWORD_PLACEHOLDER, "尚未设置交易密码");
assert.equal(TRADING_PASSWORD_GATE_EMPTY_VALUE, "empty");

console.log("Account trading password verification: success");
