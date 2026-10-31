import { logCaughtError } from "../utils/errorLogging";
import { DynamoDBClient, GetItemCommand, DeleteItemCommand, TransactWriteItemsCommand, UpdateItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import type { CredentialState, SessionIdentity, SessionStore } from "../auth/sessionService";
import type { PasswordVerifier } from "../auth/password";

export interface StoredCredential extends CredentialState {
  verifier: PasswordVerifier;
  updatedAt: string;
  lastSignInAt: string | null;
}

/** Strong base-table reads; no credential or permission cache. */
export class AuthStateRepository implements SessionStore {
  constructor(private readonly tableName: string, private readonly client = new DynamoDBClient({})) {
    if (!tableName) throw new Error("AUTH_TABLE_NAME is required.");
  }

  private async read<T>(pk: string): Promise<T | null> {
    const result = await this.client.send(new GetItemCommand({ TableName: this.tableName, Key: { pk: { S: pk } }, ConsistentRead: true }));
    if (!result.Item) return null;
    const value = result.Item.payload?.S;
    if (!value) throw new Error("Authentication state is malformed.");
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") throw new Error("Authentication state is malformed.");
    const row = parsed as Record<string,unknown>;
    if (!Number.isSafeInteger(row.credentialVersion) || Number(row.credentialVersion) < 1) throw new Error("Authentication version is malformed.");
    if (pk.startsWith("SESSION#") && (typeof row.userId!=="string" || !["full","password_change"].includes(String(row.purpose)) || !Number.isSafeInteger(row.expiresAt))) throw new Error("Session state is malformed.");
    if (pk.startsWith("USER#")) {
      if(typeof row.mustChangePassword!=="boolean" || (row.temporaryPasswordExpiresAt!==null && !Number.isSafeInteger(row.temporaryPasswordExpiresAt)) || !row.verifier || typeof row.verifier!=="object") throw new Error("Credential state is malformed.");
      if(result.Item.lastSignInAt?.S) row.lastSignInAt=result.Item.lastSignInAt.S;
    }
    return parsed as T;
  }

  getCredential(userId: string): Promise<StoredCredential | null> { return this.read(`USER#${userId}`); }
  getSession(digest: string): Promise<SessionIdentity | null> { return this.read(`SESSION#${digest}`); }

  async createSession(digest: string, session: SessionIdentity): Promise<void> {
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Update: { TableName: this.tableName, Key: { pk: { S: `USER#${session.userId}` } }, UpdateExpression: "SET lastSignInAt = :signin",
        ConditionExpression: "credentialVersion = :version", ExpressionAttributeValues: { ":version": { N: String(session.credentialVersion) }, ":signin": { S: new Date().toISOString() } } } },
      { Put: { TableName: this.tableName, Item: this.item(`SESSION#${digest}`, session, session.expiresAt), ConditionExpression: "attribute_not_exists(pk)" } }
    ] }));
  }

  async deleteSession(digest: string): Promise<void> {
    await this.client.send(new DeleteItemCommand({ TableName: this.tableName, Key: { pk: { S: `SESSION#${digest}` } } }));
  }

  async replaceCredential(userId: string, credential: StoredCredential, previousVersion: number | null, actor?: {userId: string; credentialVersion: number}): Promise<void> {
    if (credential.credentialVersion !== (previousVersion ?? 0) + 1) throw new Error("Invalid credential version transition.");
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [...(actor ? [{ ConditionCheck: { TableName: this.tableName, Key: { pk: { S: `USER#${actor.userId}` } }, ConditionExpression: "credentialVersion = :version", ExpressionAttributeValues: { ":version": { N: String(actor.credentialVersion) } } } }] : []), { Put: {
      TableName: this.tableName,
      Item: { ...this.item(`USER#${userId}`, credential), credentialVersion: { N: String(credential.credentialVersion) } },
      ConditionExpression: previousVersion === null ? "attribute_not_exists(pk)" : "credentialVersion = :version",
      ...(previousVersion === null ? {} : { ExpressionAttributeValues: { ":version": { N: String(previousVersion) } } })
    } }] }));
  }

  async consumeAttempt(key: string, limit: number, expiresAt: number): Promise<boolean> {
    try {
      await this.client.send(new UpdateItemCommand({TableName:this.tableName,Key:{pk:{S:key}},
        UpdateExpression:"SET expiresAt = :expiry ADD attempts :one",ConditionExpression:"attribute_not_exists(attempts) OR attempts < :limit",
        ExpressionAttributeValues:{":expiry":{N:String(expiresAt)},":one":{N:"1"},":limit":{N:String(limit)}}}));
      return true;
    } catch(error) { logCaughtError("auth.operation", {name:"ApiAuthError",message:"Authentication operation failed.",statusCode: error && typeof error === "object" && "statusCode" in error ? error.statusCode : 503}); if(error instanceof Error && error.name === "ConditionalCheckFailedException") return false; throw error; }
  }

  async invalidateSessions(userId: string): Promise<void> {
    const current = await this.getCredential(userId);
    if (!current) throw new Error("User credentials require provisioning before access can resume.");
    await this.replaceCredential(userId,{...current,credentialVersion:current.credentialVersion+1,updatedAt:new Date().toISOString()},current.credentialVersion);
  }
  private item(pk: string, payload: unknown, expiresAt?: number): Record<string, AttributeValue> {
    return { pk: { S: pk }, payload: { S: JSON.stringify(payload) }, ...(expiresAt === undefined ? {} : { expiresAt: { N: String(expiresAt) } }) };
  }
}
