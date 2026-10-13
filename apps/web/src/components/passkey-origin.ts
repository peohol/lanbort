/**
 * The same page on the configured WebAuthn origin, when the current page is
 * on an alternative host. Passkeys cannot cross registrable domains, so the
 * browser must move before a ceremony starts. Null means it is already safe
 * to start here, or this deployment has no configured passkey origin.
 */
export function passkeyOriginRedirect(
  currentHref: string,
  configuredOrigin: string | undefined,
): string | null {
  if (!configuredOrigin) return null;

  const current = new URL(currentHref);
  const configured = new URL(configuredOrigin);

  if (current.origin === configured.origin) return null;

  return `${configured.origin}${current.pathname}${current.search}${current.hash}`;
}
