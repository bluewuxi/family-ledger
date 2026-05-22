import type { Instrument } from "@family-ledger/shared";
import { listInstruments } from "../repositories/instrumentRepository";

export async function getInstruments(): Promise<Instrument[]> {
  return listInstruments();
}
