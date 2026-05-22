import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

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
  const cached = parameterCache.get(parameterName);

  if (cached) {
    return cached;
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

  parameterCache.set(parameterName, value);
  return value;
}
