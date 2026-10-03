import { useCallback, useRef, useState } from "react";

/**
 * Browser-print helper for paginated reports.
 * When print is requested, the page re-fetches with a large limit so the
 * printed output contains the full report, then restores normal pagination
 * after the print dialog closes.
 */
export function useReportPrint(allLimit = 1000) {
  const [printLimit, setPrintLimit] = useState<number | undefined>(undefined);
  const pendingRef = useRef(false);

  const requestPrint = useCallback(() => {
    pendingRef.current = true;
    setPrintLimit(allLimit);
  }, [allLimit]);

  const notifyReady = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;

    const restore = () => {
      setPrintLimit(undefined);
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);

    setTimeout(() => window.print(), 100);
  }, []);

  return { printLimit, requestPrint, notifyReady };
}
