import type { ShownOwner } from "@lanbort/contracts";
import { Fragment } from "react";
import { listSeparator, ownersLabel } from "@/presentation/objects";
import { PersonName } from "./person-name";

/**
 * A thing's owners as a member sees them (PS-ENV-015), each linked to their
 * page while the reader may open it, said as a list: «Anna, Bo og Cleo».
 */
export function OwnerNames({ owners }: { owners: readonly ShownOwner[] }) {
  return owners.map((owner, index) => (
    <Fragment key={index}>
      {listSeparator(index, owners.length)}
      <PersonName person={owner} />
    </Fragment>
  ));
}

/**
 * «Eier: Anna» for a line of details; null when nobody else is named, so the
 * line leaves the part out.
 */
export const ownersDetail = (owners: readonly ShownOwner[]) =>
  owners.length === 0 ? null : (
    <>
      {ownersLabel(owners)}: <OwnerNames owners={owners} />
    </>
  );
