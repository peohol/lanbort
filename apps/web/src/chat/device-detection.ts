import type {
  ChatDeviceBrowser,
  ChatDeviceDescription,
  ChatDeviceKind,
  ChatDeviceSystem,
} from "@lanbort/contracts";

/**
 * What the browser tells about the device it runs on: its user agent and,
 * in Chromium browsers, the client hints that need no permission (the
 * brands, the platform and whether it is a phone). No version, model or
 * other high-entropy hint is asked for.
 */
export interface Agent {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  readonly hints?: {
    readonly brands: readonly { readonly brand: string }[];
    readonly platform: string;
    readonly mobile: boolean;
  };
}

const hintedSystems: Record<string, ChatDeviceSystem> = {
  Windows: "windows",
  macOS: "macos",
  Android: "android",
  "Chrome OS": "chromeos",
  ChromeOS: "chromeos",
  Linux: "linux",
};

/**
 * Brands a Chromium browser names itself by. One that only says
 * «Chromium» could be any of many, so it says nothing.
 */
const hintedBrowsers: Record<string, ChatDeviceBrowser> = {
  "Microsoft Edge": "edge",
  "Google Chrome": "chrome",
  Opera: "opera",
  Brave: "brave",
  "Samsung Internet": "samsung",
};

/**
 * The browser by its user agent, first match wins. Chromium browsers that
 * read exactly like Chrome are told apart only by their hints, so a user
 * agent with another known browser's token is no browser we name, nor is an
 * app's built-in web view.
 */
const agentBrowsers: readonly [RegExp, ChatDeviceBrowser | null][] = [
  [/; wv\)|FBAN|FBAV|Instagram|Line\/|YaBrowser|Vivaldi|UCBrowser/, null],
  [/Edg(?:e|A|iOS)?\//, "edge"],
  [/OPR\/|OPiOS\//, "opera"],
  [/SamsungBrowser\//, "samsung"],
  [/Firefox\/|FxiOS\//, "firefox"],
  [/CriOS\/|Chrome\//, "chrome"],
  [/Version\/[\d.]+.* Safari\//, "safari"],
];

function systemAndKind(agent: Agent): {
  system: ChatDeviceSystem | null;
  kind: ChatDeviceKind | null;
} {
  const ua = agent.userAgent;
  if (/iPhone|iPod/.test(ua)) return { system: "ios", kind: "mobile" };
  if (/iPad/.test(ua)) return { system: "ipados", kind: "tablet" };
  // An iPad asks for desktop pages as a Mac; no Mac has a touch screen.
  if (/Macintosh/.test(ua)) {
    return agent.maxTouchPoints > 1
      ? { system: "ipados", kind: "tablet" }
      : { system: "macos", kind: "computer" };
  }

  const system =
    (agent.hints && hintedSystems[agent.hints.platform]) ??
    (/Android/.test(ua)
      ? "android"
      : /CrOS/.test(ua)
        ? "chromeos"
        : /Windows/.test(ua)
          ? "windows"
          : /Linux/.test(ua)
            ? "linux"
            : null);

  if (system === "android") {
    // Android's own rule: a phone's browser says «Mobile», a tablet's not.
    const mobile = agent.hints?.mobile ?? /Mobile/.test(ua);
    return { system, kind: mobile ? "mobile" : "tablet" };
  }
  return { system, kind: system ? "computer" : null };
}

function browser(agent: Agent): ChatDeviceBrowser | null {
  if (agent.hints) {
    for (const { brand } of agent.hints.brands) {
      const named = hintedBrowsers[brand];
      if (named) return named;
    }
    return null;
  }
  return (
    agentBrowsers.find(([pattern]) => pattern.test(agent.userAgent))?.[1] ??
    null
  );
}

/**
 * What kind of device this is, its system and its browser, as far as the
 * browser tells. What it cannot tell for sure is null, never a guess: it is
 * only a suggestion the person can change.
 */
export function describeAgent(agent: Agent): ChatDeviceDescription {
  return { ...systemAndKind(agent), browser: browser(agent) };
}

interface HintedNavigator {
  userAgentData?: Agent["hints"];
}

/** This browser's device, described by itself. */
export function describeThisDevice(): ChatDeviceDescription {
  const { userAgent, maxTouchPoints, userAgentData } = navigator as Navigator &
    HintedNavigator;
  return describeAgent({
    userAgent,
    maxTouchPoints,
    ...(userAgentData && { hints: userAgentData }),
  });
}
