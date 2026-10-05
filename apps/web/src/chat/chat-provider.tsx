"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ApiFailureCode } from "@/components/api-client";
import { isChatPage } from "@/navigation/chat";
import { ChatApiError } from "./api";
import { type ChatEngine, type ChatSetup, loadChat } from "./engine";

export type ChatState =
  | { status: "loading" }
  /** Another tab in this browser already runs this device's chat. */
  | { status: "elsewhere" }
  | { status: "failed"; code: ApiFailureCode }
  | { status: Exclude<ChatSetup, "ready"> }
  | { status: "ready"; engine: ChatEngine };

interface ChatContextValue {
  userId: string;
  state: ChatState;
  /** After the device has started chat, been linked or reset. */
  started(engine: ChatEngine): void;
  /** Reads where the device stands again, e.g. after it was revoked. */
  reload(): void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat outside ChatProvider");
  return value;
}

/** How often an open chat page asks for new messages (no push, OD-0004). */
const syncIntervalMs = 15_000;
const lockWaitMs = 3_000;

/** The path the page's document was loaded with, not navigated to since. */
export function loadedPath(): string {
  const entry = performance.getEntriesByType("navigation")[0];
  return entry ? new URL(entry.name).pathname : location.pathname;
}

const failure = (error: unknown): ChatState => ({
  status: "failed",
  code: error instanceof ChatApiError ? error.code : "internal_error",
});

/**
 * Runs this device's chat while a chat page is open. Chat pages have their
 * own strict security headers (ADR-0010 §13); a page reached by navigating
 * inside the app still runs under the document's first headers, so it is
 * loaded anew before any key is touched. One tab at a time holds the
 * device's chat, since two would start from the same group state.
 */
export function ChatProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<ChatState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isChatPage(loadedPath())) {
      location.reload();
      return;
    }

    let cancelled = false;
    // Waits a moment for a lock this page is just letting go of (leaving
    // one chat page for another); a lock held longer is another tab's.
    navigator.locks
      .request(
        `lanbort-chat-${userId}`,
        { signal: AbortSignal.timeout(lockWaitMs) },
        async () => {
          if (cancelled) return;
          // Held until the chat pages are left.
          const held = new Promise<void>((resolve) => {
            release.current = resolve;
          });
          try {
            const loaded = await loadChat(userId);
            if (!cancelled) {
              setState(
                loaded.setup === "ready"
                  ? { status: "ready", engine: loaded.engine }
                  : { status: loaded.setup },
              );
            }
          } catch (error) {
            if (!cancelled) setState(failure(error));
          }
          await held;
        },
      )
      .catch(() => {
        if (!cancelled) setState({ status: "elsewhere" });
      });

    return () => {
      cancelled = true;
      release.current?.();
      release.current = null;
    };
  }, [userId, attempt]);

  const engine = state.status === "ready" ? state.engine : undefined;

  useEffect(() => {
    if (!engine) return;
    const sync = () => {
      if (document.visibilityState === "visible") {
        engine.sync().catch(() => undefined);
      }
    };
    sync();
    const interval = setInterval(sync, syncIntervalMs);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [engine]);

  const started = useCallback(
    (ready: ChatEngine) => setState({ status: "ready", engine: ready }),
    [],
  );
  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return (
    <ChatContext.Provider value={{ userId, state, started, reload }}>
      {children}
    </ChatContext.Provider>
  );
}

/** Re-renders when the engine reports a change. */
export function useEngineVersion(engine: ChatEngine | undefined): number {
  const [version, setVersion] = useState(0);
  useEffect(() => engine?.subscribe(() => setVersion((n) => n + 1)), [engine]);
  return version;
}
