export function multiplyDecimalStrings(left: string, right: string, outputScale: number): string | null {
  const normalizedLeft = normalizeDecimalString(left);
  const normalizedRight = normalizeDecimalString(right);

  if (!normalizedLeft || !normalizedRight) {
    return null;
  }

  const leftScale = decimalScale(normalizedLeft);
  const rightScale = decimalScale(normalizedRight);
  const product = toScaledBigInt(normalizedLeft, leftScale) * toScaledBigInt(normalizedRight, rightScale);
  const productScale = leftScale + rightScale;

  if (productScale <= outputScale) {
    return fromScaledBigInt(product * 10n ** BigInt(outputScale - productScale), outputScale);
  }

  const divisor = 10n ** BigInt(productScale - outputScale);
  const quotient = product / divisor;
  const remainder = product % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

  return fromScaledBigInt(rounded, outputScale);
}

export function compareDecimalStrings(left: string, right: string, scale: number): number {
  const leftAmount = toScaledBigInt(normalizeDecimalString(left) ?? "0", scale);
  const rightAmount = toScaledBigInt(normalizeDecimalString(right) ?? "0", scale);

  if (leftAmount === rightAmount) {
    return 0;
  }
  return leftAmount > rightAmount ? 1 : -1;
}

export function addDecimalStrings(left: string, right: string, scale: number): string {
  const total =
    toScaledBigInt(normalizeDecimalString(left) ?? "0", scale) +
    toScaledBigInt(normalizeDecimalString(right) ?? "0", scale);
  return fromScaledBigInt(total, scale);
}

export function normalizeDecimalString(value: string | number | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(normalized) ? normalized : null;
}

function decimalScale(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

export function toScaledBigInt(value: string, scale: number): bigint {
  const [integerPart, decimalPart = ""] = value.split(".");
  const paddedDecimal = decimalPart.padEnd(scale, "0").slice(0, scale);
  return BigInt(`${integerPart}${paddedDecimal}`);
}

export function fromScaledBigInt(value: bigint, scale: number): string {
  const raw = value.toString().padStart(scale + 1, "0");
  const integerPart = raw.slice(0, -scale);
  const decimalPart = raw.slice(-scale).replace(/0+$/u, "");
  return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
}

