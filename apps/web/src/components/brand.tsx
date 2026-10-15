import { logo } from "@/presentation/logo";

/**
 * Lånbort's mark and name (Tomat): the «l» in tomat, the b's bowl and
 * «bort» in the colour of the text, so both follow the theme. The name is
 * what assistive technology hears; the mark says nothing itself.
 */
export function Brand() {
  return (
    <>
      <svg
        className="logo"
        aria-hidden="true"
        focusable="false"
        viewBox={logo.viewBox}
        width="32"
        height="32"
        fill="none"
        strokeWidth={logo.stroke}
        strokeLinecap="round"
      >
        <path
          className="logo-bowl"
          d={logo.bowl}
          strokeWidth={logo.bowlStroke}
        />
        <path className="logo-stem" d={logo.stem} />
      </svg>
      <span className="wordmark">
        <span className="wordmark-lend">lån</span>bort
      </span>
    </>
  );
}
