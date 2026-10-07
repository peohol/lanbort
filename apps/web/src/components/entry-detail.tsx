import { Fragment, type ReactNode } from "react";

/** A line of details on a list entry, the parts given separated by « · ». */
export function EntryDetail({ parts }: { parts: readonly ReactNode[] }) {
  const shown = parts.filter(
    (part) =>
      part !== null && part !== undefined && part !== false && part !== "",
  );

  return (
    <span className="entry-detail">
      {shown.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && " · "}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
