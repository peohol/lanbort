/** A code in groups of five that are easy to read aloud and type. */
export const groupCode = (code: string) =>
  code.match(/.{1,5}/g)?.join(" ") ?? code;
