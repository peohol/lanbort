import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { AuthProviderError } from "./errors";

export interface AuthenticationMethod {
  method: string;
  at: Date;
}

/** A provider identity verified by the provider for this request. */
export interface VerifiedIdentity {
  provider: "supabase";
  subject: string;
  email: string | null;
  emailVerified: boolean;
  authentication: {
    sessionId: string;
    assurance: "aal1" | "aal2";
    methods: AuthenticationMethod[];
  };
}

/** Only these claims are read from the access token, after it is verified. */
const sessionClaimsSchema = z.object({
  sub: z.string(),
  session_id: z.string(),
  aal: z.enum(["aal1", "aal2"]),
  amr: z
    .array(z.object({ method: z.string(), timestamp: z.number() }))
    .default([]),
});

function decodeClaims(accessToken: string) {
  const payload = accessToken.split(".")[1];

  if (!payload) {
    throw new AuthProviderError("unavailable");
  }

  try {
    return sessionClaimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    throw new AuthProviderError("unavailable");
  }
}

/**
 * Builds the identity from the provider's user record (authoritative for
 * e-mail verification) and the verified session claims (authentication
 * strength). User-editable metadata is never read.
 */
export function toIdentity(user: User, accessToken: string): VerifiedIdentity {
  const claims = decodeClaims(accessToken);

  if (claims.sub !== user.id) {
    throw new AuthProviderError("unavailable");
  }

  return {
    provider: "supabase",
    subject: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email && user.email_confirmed_at),
    authentication: {
      sessionId: claims.session_id,
      assurance: claims.aal,
      methods: claims.amr.map(({ method, timestamp }) => ({
        method,
        at: new Date(timestamp * 1000),
      })),
    },
  };
}
