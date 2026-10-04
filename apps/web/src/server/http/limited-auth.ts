import type { AuthGateway } from "@lanbort/auth";
import {
  consumeRateLimit,
  type DomainContext,
  type RateLimit,
  rateLimits,
} from "@lanbort/domain";

/**
 * Sign-in and re-authentication codes with rate limits (WP-73, threat model
 * «Konto-overtakelse»). The provider only sees the server, so its own limits
 * per client cannot tell clients apart; these count per e-mail address and
 * per client address before the provider is asked. A refused attempt never
 * reaches the provider.
 */
export function withCodeLimits(
  auth: AuthGateway,
  domain: () => DomainContext,
  client: string | null,
): AuthGateway {
  async function limit(
    email: string,
    perAddress: RateLimit,
    perClient: RateLimit,
  ) {
    if (client) {
      await consumeRateLimit(domain(), perClient, `client:${client}`);
    }

    await consumeRateLimit(
      domain(),
      perAddress,
      `email:${email.trim().toLowerCase()}`,
    );
  }

  return {
    ...auth,
    async requestEmailCode(email) {
      await limit(
        email,
        rateLimits.emailCodesPerAddress,
        rateLimits.emailCodesPerClient,
      );
      return auth.requestEmailCode(email);
    },
    async verifyEmailCode(email, code) {
      await limit(
        email,
        rateLimits.codeAttemptsPerAddress,
        rateLimits.codeAttemptsPerClient,
      );
      return auth.verifyEmailCode(email, code);
    },
  };
}
