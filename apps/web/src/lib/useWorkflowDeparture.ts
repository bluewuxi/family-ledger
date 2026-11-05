import { useBeforeUnload, useBlocker } from "react-router-dom";
import { useCallback, useEffect, type RefObject } from "react";

export function useWorkflowDeparture(dirty: boolean, busy: boolean, allowExit?: RefObject<boolean>, internalRoot?: string) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowExit?.current && (busy || dirty) && currentLocation.pathname !== nextLocation.pathname && !(internalRoot && nextLocation.pathname.startsWith(internalRoot)));
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (busy) { blocker.reset(); return; }
    if (window.confirm("有未保存的修改，确定离开吗？")) blocker.proceed();
    else blocker.reset();
  }, [blocker, busy]);
  useBeforeUnload(useCallback(event => {
    if (!allowExit?.current && (dirty || busy)) { event.preventDefault(); event.returnValue = ""; }
  }, [dirty, busy, allowExit]));
}
