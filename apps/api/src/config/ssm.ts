import { DeleteParameterCommand, GetParameterCommand, PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const parameterCache = new Map<string, string>();
let ssmClient: SSMClient | null = null;

function getSsmClient(): SSMClient {
  if (!ssmClient) {
    const region = process.env.AWS_REGION;

    if (!region) {
      throw new Error("AWS_REGION is required to resolve SSM parameters.");
    }

    ssmClient = new SSMClient({ region });
  }

  return ssmClient;
}

export async function resolveSecureParameter(parameterName: string): Promise<string> {
  if (!parameterName) {
    throw new Error("SSM parameter name is required.");
  }

  const cached = parameterCache.get(parameterName);

  if (cached) {
    return cached;
  }

  const value = await getSecureParameter(parameterName);

  parameterCache.set(parameterName, value);
  return value;
}

export async function getSecureParameter(parameterName: string): Promise<string> {
  if (!parameterName) {
    throw new Error("SSM parameter name is required.");
  }

  const response = await getSsmClient().send(
    new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true
    })
  );

  const value = response.Parameter?.Value;

  if (!value) {
    throw new Error("Required SSM parameter could not be resolved.");
  }

  return value;
}

export async function putSecureParameter(parameterName: string, value: string, overwrite: boolean): Promise<void> {
  if (!parameterName) {
    throw new Error("SSM parameter name is required.");
  }

  await getSsmClient().send(
    new PutParameterCommand({
      Name: parameterName,
      Type: "SecureString",
      Value: value,
      Overwrite: overwrite
    })
  );
}

export async function getParameter(parameterName: string): Promise<string> {
  if (!parameterName) {
    throw new Error("SSM parameter name is required.");
  }

  const response = await getSsmClient().send(new GetParameterCommand({ Name: parameterName }));
  const value = response.Parameter?.Value;

  if (!value) {
    throw new Error("Required SSM parameter could not be resolved.");
  }

  return value;
}

export async function putStringParameter(parameterName: string, value: string, overwrite: boolean): Promise<void> {
  if (!parameterName) {
    throw new Error("SSM parameter name is required.");
  }

  await getSsmClient().send(
    new PutParameterCommand({
      Name: parameterName,
      Type: "String",
      Value: value,
      Overwrite: overwrite
    })
  );
}

export async function deleteSecureParameter(parameterName: string): Promise<void> {
  if (!parameterName) {
    throw new Error("SSM parameter name is required.");
  }

  await getSsmClient().send(new DeleteParameterCommand({ Name: parameterName }));
}

export function isSsmParameterNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "ParameterNotFound";
}

export function isSsmParameterAlreadyExists(error: unknown): boolean {
  return error instanceof Error && error.name === "ParameterAlreadyExists";
}
