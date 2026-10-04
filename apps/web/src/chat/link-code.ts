/** A 26-character link code in groups that are easy to read aloud and type. */
export const groupLinkCode = (code: string) =>
  code.match(/.{1,5}/g)?.join(" ") ?? code;
