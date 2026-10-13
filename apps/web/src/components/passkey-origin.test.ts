import { describe, expect, it } from "vitest";
import { passkeyOriginRedirect } from "./passkey-origin";

describe("passkey origin", () => {
  it("keeps a ceremony on the configured relying-party origin", () => {
    expect(
      passkeyOriginRedirect(
        "https://www.xn--lnbort-iua.no/forvaltning/passkeys?fra=hjem#ny",
        "https://www.xn--lnbort-iua.no",
      ),
    ).toBeNull();
  });

  it("moves an alternative host to the same page on the relying-party origin", () => {
    expect(
      passkeyOriginRedirect(
        "https://lanbort.vercel.app/saker/123?vis=inngrep#bekreft",
        "https://www.xn--lnbort-iua.no",
      ),
    ).toBe(
      "https://www.xn--lnbort-iua.no/saker/123?vis=inngrep#bekreft",
    );
  });

  it("does nothing when passkeys are not configured for the deployment", () => {
    expect(
      passkeyOriginRedirect("http://localhost:3000/forvaltning", undefined),
    ).toBeNull();
  });
});
