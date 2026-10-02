import type { AuthGateway, VerifiedIdentity } from "@lanbort/auth";
import { ConsumerRegistry, type UserActor } from "@lanbort/domain";
import { describe, expect, it, vi } from "vitest";
import {
  confirmReauthentication,
  type ReauthenticationContext,
  requestReauthentication,
} from "./reauthentication";

const actor: UserActor = {
  kind: "user",
  userId: "00000000-0000-4000-8000-000000000001",
  accountStatus: "active",
  authentication: {
    sessionId: "s",
    assurance: "aal1",
    methods: [{ method: "otp", at: new Date(Date.now() - 3_600_000) }],
  },
  platformRoles: [],
};

function context(email: string | null) {
  const auth = {
    requestEmailCode: vi.fn(async () => {}),
    verifyEmailCode: vi.fn(),
  };

  return {
    auth,
    context: {
      actor,
      identity: { email } as VerifiedIdentity,
      auth: auth as unknown as AuthGateway,
      domain: { db: {} as never, consumers: new ConsumerRegistry() },
      requestId: "r",
    } satisfies ReauthenticationContext,
  };
}

describe("re-authentication (WP-12)", () => {
  it("sends the code to the own verified address only, however old the session", async () => {
    const { auth, context: ctx } = context("kari@example.test");

    await requestReauthentication(ctx);

    expect(auth.requestEmailCode).toHaveBeenCalledWith("kari@example.test");
  });

  it("has no address to confirm without a verified e-mail", async () => {
    const { auth, context: ctx } = context(null);

    await expect(requestReauthentication(ctx)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(confirmReauthentication(ctx, "123456")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(auth.requestEmailCode).not.toHaveBeenCalled();
    expect(auth.verifyEmailCode).not.toHaveBeenCalled();
  });
});
