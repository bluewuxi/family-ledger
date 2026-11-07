import { i18n, getUiLanguage } from "../i18n/instance";
import { useEffect, useRef } from "react";

// Compare only in memory; sensitive form values never enter browser storage.
export function useEditDismissal(open: boolean, busy: boolean, values: unknown, onClose: () => void) {
  const baseline = useRef("");
  const serialized = JSON.stringify(values);
  useEffect(() => { if (open) baseline.current = serialized; }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return () => {
    if (!busy && (baseline.current === serialized || window.confirm(i18n.getFixedT(getUiLanguage(), "common")("discard")))) onClose();
  };
}
