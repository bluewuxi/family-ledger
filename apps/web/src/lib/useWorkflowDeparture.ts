import { i18n, getUiLanguage } from "../i18n/instance";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { useCallback, useEffect, type RefObject } from "react";

export function useWorkflowDeparture(dirty: boolean, busy: boolean, allowExit?: RefObject<boolean>, internalRoot?: string, includeSearch = false) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowExit?.current && (busy || dirty) && (currentLocation.pathname !== nextLocation.pathname || (includeSearch && currentLocation.search !== nextLocation.search)) && !(internalRoot && nextLocation.pathname.startsWith(internalRoot)));
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (busy) { blocker.reset(); return; }
    if (window.confirm(i18n.getFixedT(getUiLanguage(), "common")("discard"))) blocker.proceed();
    else blocker.reset();
  }, [blocker, busy]);
  useBeforeUnload(useCallback(event => {
    if (!allowExit?.current && (dirty || busy)) { event.preventDefault(); event.returnValue = ""; }
  }, [dirty, busy, allowExit]));
}
