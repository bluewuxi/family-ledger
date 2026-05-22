export interface HoldingSummary {
  instrument: string;
  account: string;
  quantity: string;
  cost: string;
  marketValue: string;
  unrealizedGain: string;
}

export async function getHoldings(): Promise<HoldingSummary[]> {
  // TODO: Stage 3 will calculate holdings in the API business layer.
  return [];
}
