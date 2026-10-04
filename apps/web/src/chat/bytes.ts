/** Standard base64, as the chat API carries binary values. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

export const utf8 = (text: string) => new TextEncoder().encode(text);
export const fromUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
