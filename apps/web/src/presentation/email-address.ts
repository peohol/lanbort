import { domainToASCII, domainToUnicode } from "node:url";

/**
 * An email address as people read it (`sikkerhet@lånbort.no`) and as a
 * `mailto:` link mail programs accept (the domain in its ASCII form), from
 * either form in configuration.
 */
export function emailAddressForms(address: string) {
  const at = address.lastIndexOf("@");
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  return {
    shown: `${local}@${domainToUnicode(domain) || domain}`,
    href: `mailto:${local}@${domainToASCII(domain) || domain}`,
  };
}
