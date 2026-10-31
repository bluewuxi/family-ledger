import assert from "node:assert/strict";
import { AuthStateRepository, type StoredCredential } from "../apps/api/src/repositories/authStateRepository";
import { createSessionToken, hashSessionToken } from "../apps/api/src/auth/sessionToken";
import type { SessionIdentity } from "../apps/api/src/auth/sessionService";

type CapturedCommand = { constructor: { name: string }; input: unknown };
type TransactionInput = { TransactItems: Array<{
  Update?: { Key: unknown; ConditionExpression: string; ExpressionAttributeValues: unknown };
  Put?: { Item: { pk: unknown; payload: { S: string }; credentialVersion?: unknown; expiresAt?: unknown }; ConditionExpression: string; ExpressionAttributeValues?: unknown };
  ConditionCheck?: { Key: unknown; ConditionExpression: string; ExpressionAttributeValues: unknown };
}> };

async function main(): Promise<void> {
  const calls: CapturedCommand[] = [];
  let response: unknown = {};
  let thrown: Error | undefined;
  const fake = {
    async send(command: CapturedCommand): Promise<unknown> {
      calls.push(command);
      if (thrown) throw thrown;
      return response;
    }
  } as unknown as NonNullable<ConstructorParameters<typeof AuthStateRepository>[1]>;
  const store = new AuthStateRepository("isolated-fixture", fake);
  const lastInput = <T>(): T => calls[calls.length - 1].input as T;
  const credential: StoredCredential = {
    verifier: { algorithm: "scrypt", version: 1, N: 131072, r: 8, p: 1, salt: "00".repeat(16), hash: "00".repeat(64) },
    credentialVersion: 4, mustChangePassword: false, temporaryPasswordExpiresAt: null,
    updatedAt: "2026-10-31T00:00:00.000Z", lastSignInAt: null
  };
  const token = createSessionToken();
  const digest = hashSessionToken(token);
  const session: SessionIdentity = { userId: "target", credentialVersion: 4, purpose: "full", expiresAt: 10000 };

  response = { Item: { payload: { S: JSON.stringify(credential) }, lastSignInAt: { S: "2026-10-31T01:00:00.000Z" } } };
  assert.equal((await store.getCredential("target"))?.lastSignInAt, "2026-10-31T01:00:00.000Z");
  assert.deepEqual(lastInput(), { TableName: "isolated-fixture", Key: { pk: { S: "USER#target" } }, ConsistentRead: true });
  response = { Item: { payload: { S: JSON.stringify(session) } } };
  assert.deepEqual(await store.getSession(digest), session);
  assert.equal(lastInput<{ ConsistentRead: boolean }>().ConsistentRead, true);
  response = {};
  assert.equal(await store.getCredential("absent"), null);

  await store.createSession(digest, session);
  assert.equal(calls.at(-1)?.constructor.name, "TransactWriteItemsCommand");
  const creation = lastInput<TransactionInput>().TransactItems;
  assert.equal(creation.length, 2);
  assert.deepEqual(creation[0].Update?.Key, { pk: { S: "USER#target" } });
  assert.equal(creation[0].Update?.ConditionExpression, "credentialVersion = :version");
  assert.equal(creation[1].Put?.ConditionExpression, "attribute_not_exists(pk)");
  assert.deepEqual(creation[1].Put?.Item.pk, { S: `SESSION#${digest}` });
  assert.deepEqual(creation[1].Put?.Item.expiresAt, { N: "10000" });
  assert.equal(JSON.stringify(creation).includes(token), false);
  assert.deepEqual(JSON.parse(creation[1].Put!.Item.payload.S), session);

  await store.replaceCredential("target", { ...credential, credentialVersion: 5 }, 4, { userId: "admin", credentialVersion: 8 });
  const reset = lastInput<TransactionInput>().TransactItems;
  assert.equal(reset.length, 2);
  assert.deepEqual(reset[0].ConditionCheck, {
    TableName: "isolated-fixture", Key: { pk: { S: "USER#admin" } },
    ConditionExpression: "credentialVersion = :version", ExpressionAttributeValues: { ":version": { N: "8" } }
  });
  assert.equal(reset[1].Put?.ConditionExpression, "credentialVersion = :version");
  assert.deepEqual(reset[1].Put?.ExpressionAttributeValues, { ":version": { N: "4" } });
  assert.deepEqual(reset[1].Put?.Item.credentialVersion, { N: "5" });
  await assert.rejects(store.replaceCredential("target", { ...credential, credentialVersion: 8 }, 4));
  await store.replaceCredential("new", { ...credential, credentialVersion: 1 }, null);
  assert.equal(lastInput<TransactionInput>().TransactItems[0].Put?.ConditionExpression, "attribute_not_exists(pk)");

  response = { Item: { payload: { S: JSON.stringify(credential) } } };
  await store.invalidateSessions("target");
  const invalidation = lastInput<TransactionInput>().TransactItems[0].Put!;
  assert.equal(JSON.parse(invalidation.Item.payload.S).credentialVersion, 5);
  assert.deepEqual(invalidation.ExpressionAttributeValues, { ":version": { N: "4" } });
  response = {};
  await assert.rejects(store.invalidateSessions("unprovisioned"), /provisioning/);

  assert.equal(await store.consumeAttempt("RATE#fixture", 10, 1800), true);
  assert.deepEqual(lastInput(), {
    TableName: "isolated-fixture", Key: { pk: { S: "RATE#fixture" } },
    UpdateExpression: "SET expiresAt = :expiry ADD attempts :one",
    ConditionExpression: "attribute_not_exists(attempts) OR attempts < :limit",
    ExpressionAttributeValues: { ":expiry": { N: "1800" }, ":one": { N: "1" }, ":limit": { N: "10" } }
  });
  thrown = Object.assign(new Error("fixture limit"), { name: "ConditionalCheckFailedException" });
  assert.equal(await store.consumeAttempt("RATE#fixture", 10, 1800), false);
  thrown = Object.assign(new Error("fixture unavailable"), { name: "ServiceUnavailable" });
  await assert.rejects(store.consumeAttempt("RATE#fixture", 10, 1800), { name: "ServiceUnavailable" });
  await assert.rejects(store.deleteSession(digest), { name: "ServiceUnavailable" });
  thrown = undefined;
  await store.deleteSession(digest);
  assert.equal(calls.at(-1)?.constructor.name, "DeleteItemCommand");
  assert.deepEqual(lastInput(), { TableName: "isolated-fixture", Key: { pk: { S: `SESSION#${digest}` } } });

  for (const value of [null, [], { credentialVersion: 0 }, { ...session, purpose: "admin" }, { ...session, expiresAt: 1.5 }]) {
    response = { Item: { payload: { S: JSON.stringify(value) } } };
    await assert.rejects(store.getSession(digest));
  }
  for (const value of [{ ...credential, mustChangePassword: "false" }, { ...credential, verifier: null }, { ...credential, temporaryPasswordExpiresAt: "tomorrow" }]) {
    response = { Item: { payload: { S: JSON.stringify(value) } } };
    await assert.rejects(store.getCredential("target"));
  }
  response = { Item: { payload: { S: "invalid JSON" } } };
  await assert.rejects(store.getCredential("target"));
  response = { Item: {} };
  await assert.rejects(store.getCredential("target"));
  console.log("Auth state SDK-command fixtures passed: consistent reads, transaction/CAS/actor conditions, token hashing, atomic rate limits, revocation and malformed state.");
  console.log("Coverage limit: no local/real DynamoDB runtime was used; AWS transaction isolation and IAM enforcement require separately authorized disposable integration verification.");
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Auth state fixture failed."); process.exitCode = 1; });
