"use client";

import { type Attention, isNewsArea } from "@lanbort/contracts";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { areaAt } from "@/navigation/areas";
import { getJson, postJson } from "./api-client";
import { onDataChanged } from "./data-changed";

const attentionPath = "/api/notifications/attention";

const AttentionContext = createContext<Attention | null>(null);

/**
 * What the frame shows on every page: the unread notifications beside the
 * bell (UX-IA-019) and what is new in each area of the main navigation
 * (UX-IA-022). It comes with the page and is read again when the user moves
 * to another page, comes back to the tab or changes something, so it never
 * lags far behind. Opening an area's own page tells the server, which
 * answers with the area's news gone, on every device of the user's.
 */
export function AttentionProvider({
  initial,
  children,
}: {
  initial: Attention;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [attention, setAttention] = useState(initial);
  // Only the newest answer counts when several are under way.
  const latest = useRef(0);

  useEffect(() => {
    const area = areaAt(pathname);
    const refresh = async () => {
      const call = ++latest.current;
      const result =
        area && isNewsArea(area)
          ? await postJson<Attention>(attentionPath, { area })
          : await getJson<Attention>(attentionPath);

      if (call === latest.current && result.ok) setAttention(result.data);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void refresh();
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = onDataChanged(() => void refresh());

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [pathname]);

  return (
    <AttentionContext.Provider value={attention}>
      {children}
    </AttentionContext.Provider>
  );
}

export function useAttention(): Attention {
  const attention = useContext(AttentionContext);
  if (!attention) throw new Error("useAttention outside AttentionProvider");
  return attention;
}

/** A count as a badge shows it, so it never outgrows its place. */
export const badgeCount = (count: number) => (count > 99 ? "99+" : `${count}`);
