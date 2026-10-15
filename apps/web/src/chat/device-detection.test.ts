import { describe, expect, it } from "vitest";
import { type Agent, describeAgent } from "./device-detection";

const chromium = (brand: string, platform: string, mobile = false) => ({
  brands: [
    { brand: "Not)A;Brand" },
    { brand: "Chromium" },
    ...(brand ? [{ brand }] : []),
  ],
  platform,
  mobile,
});

const cases: [string, Agent, ReturnType<typeof describeAgent>][] = [
  [
    "Safari on an iPhone",
    {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
    },
    { kind: "mobile", system: "ios", browser: "safari" },
  ],
  [
    "Chrome on an iPhone",
    {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
    },
    { kind: "mobile", system: "ios", browser: "chrome" },
  ],
  [
    "Safari on an iPad, which asks for desktop pages as a Mac",
    {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
      maxTouchPoints: 5,
    },
    { kind: "tablet", system: "ipados", browser: "safari" },
  ],
  [
    "Safari on a Mac",
    {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
      maxTouchPoints: 0,
    },
    { kind: "computer", system: "macos", browser: "safari" },
  ],
  [
    "Firefox on a Mac",
    {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0",
      maxTouchPoints: 0,
    },
    { kind: "computer", system: "macos", browser: "firefox" },
  ],
  [
    "Edge on Windows, by its hints",
    {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
      maxTouchPoints: 0,
      hints: chromium("Microsoft Edge", "Windows"),
    },
    { kind: "computer", system: "windows", browser: "edge" },
  ],
  [
    "Chrome on the same Windows PC",
    {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      maxTouchPoints: 0,
      hints: chromium("Google Chrome", "Windows"),
    },
    { kind: "computer", system: "windows", browser: "chrome" },
  ],
  [
    "a Chromium browser that names no brand of its own",
    {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      maxTouchPoints: 0,
      hints: chromium("", "Windows"),
    },
    { kind: "computer", system: "windows", browser: null },
  ],
  [
    "Chrome on an Android phone",
    {
      userAgent:
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      maxTouchPoints: 5,
      hints: chromium("Google Chrome", "Android", true),
    },
    { kind: "mobile", system: "android", browser: "chrome" },
  ],
  [
    "Samsung Internet on an Android tablet, without hints",
    {
      userAgent:
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Safari/537.36",
      maxTouchPoints: 5,
    },
    { kind: "tablet", system: "android", browser: "samsung" },
  ],
  [
    "Firefox on an Android phone",
    {
      userAgent:
        "Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0",
      maxTouchPoints: 5,
    },
    { kind: "mobile", system: "android", browser: "firefox" },
  ],
  [
    "an app's built-in browser on Android",
    {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36",
      maxTouchPoints: 5,
    },
    { kind: "mobile", system: "android", browser: null },
  ],
  [
    "Chrome on a Chromebook",
    {
      userAgent:
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      maxTouchPoints: 0,
      hints: chromium("Google Chrome", "Chrome OS"),
    },
    { kind: "computer", system: "chromeos", browser: "chrome" },
  ],
  [
    "Firefox on Linux",
    {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
      maxTouchPoints: 0,
    },
    { kind: "computer", system: "linux", browser: "firefox" },
  ],
  [
    "something it does not know",
    { userAgent: "curl/8.5.0", maxTouchPoints: 0 },
    { kind: null, system: null, browser: null },
  ],
];

describe("describing a device by its browser", () => {
  it.each(cases)("%s", (_name, agent, expected) => {
    expect(describeAgent(agent)).toEqual(expected);
  });
});
