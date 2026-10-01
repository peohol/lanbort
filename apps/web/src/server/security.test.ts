import type { AuthGateway, TotpStatus, VerifiedIdentity } from "@lanbort/auth";
import { ConsumerRegistry, type UserActor } from "@lanbort/domain";
import { describe, expect, it, vi } from "vitest";
import {
  requestReauthentication,
  type SecurityContext,
  startTotpEnrollment,
  verifyTotp,
} from "./security";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

function actor(signedInMinutesAgo: number): UserActor {
  return {
    kind: "user",
    userId: "00000000-0000-4000-8000-000000000001",
    accountStatus: "active",
    authentication: {
      sessionId: "s",
      assurance: "aal1",
      methods: [{ method: "otp", at: minutesAgo(signedInMinutesAgo) }],
    },
    platformRoles: [],
  };
}

function context(user: UserActor, totp: TotpStatus) {
  const auth = {
    totpStatus: vi.fn(async () => totp),
    enrollTotp: vi.fn(async () => ({ qrCode: "data:", secret: "S" })),
    verifyTotp: vi.fn(),
    requestEmailCode: vi.fn(async () => {}),
  };

  return {
    auth,
    context: {
      actor: user,
      identity: { email: "kari@example.test" } as VerifiedIdentity,
      auth: auth as unknown as AuthGateway,
      domain: { db: {} as never, consumers: new ConsumerRegistry() },
      requestId: "r",
    } satisfies SecurityContext,
  };
}

describe("sign-in security (WP-12)", () => {
  it("starts adding an authenticator app after a recent sign-in", async () => {
    const { auth, context: ctx } = context(actor(1), "none");

    await expect(startTotpEnrollment(ctx)).resolves.toEqual({
      qrCode: "data:",
      secret: "S",
    });
    expect(auth.enrollTotp).toHaveBeenCalledOnce();
  });

  it("asks an old session to sign in again before the provider is involved", async () => {
    const { auth, context: ctx } = context(actor(60), "none");

    await expect(startTotpEnrollment(ctx)).rejects.toMatchObject({
      code: "reauthentication_required",
    });
    expect(auth.totpStatus).not.toHaveBeenCalled();
    expect(auth.enrollTotp).not.toHaveBeenCalled();
  });

  it("does not replace a confirmed app", async () => {
    const { auth, context: ctx } = context(actor(1), "verified");

    await expect(startTotpEnrollment(ctx)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(auth.enrollTotp).not.toHaveBeenCalled();
  });

  it("requires a recent sign-in to confirm a pending app", async () => {
    const { auth, context: ctx } = context(actor(60), "pending");

    await expect(verifyTotp(ctx, "123456")).rejects.toMatchObject({
      code: "reauthentication_required",
    });
    expect(auth.verifyTotp).not.toHaveBeenCalled();
  });

  it("has nothing to verify without an app", async () => {
    const { auth, context: ctx } = context(actor(1), "none");

    await expect(verifyTotp(ctx, "123456")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(auth.verifyTotp).not.toHaveBeenCalled();
  });

  it("sends the re-authentication code to the own verified address only", async () => {
    const { auth, context: ctx } = context(actor(60), "none");

    await requestReauthentication(ctx);

    expect(auth.requestEmailCode).toHaveBeenCalledWith("kari@example.test");
  });
});
