/**
 * The request header in which the proxy hands a page the address it was
 * asked for, so a page that needs a signed-in user can send the user back
 * there after signing in. What it holds is only ever used through
 * `returnPath`, which keeps it within Lånbort.
 */
export const pagePathHeader = "x-lanbort-page-path";
