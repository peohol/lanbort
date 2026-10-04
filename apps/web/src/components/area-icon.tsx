import type { AreaId } from "@/navigation/areas";

/** Simple line icons; the label next to each always says what it is. */
const paths: Record<AreaId, string> = {
  home: "M3 11 12 4l9 7v9h-6v-6H9v6H3z",
  find: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4",
  loans: "M4 8h13l-3-3M20 16H7l3 3",
  things: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
  conversations: "M4 5h16v11H9l-5 4z",
};

export function AreaIcon({ area }: { area: AreaId }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[area]} />
    </svg>
  );
}
