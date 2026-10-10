"use client";

import Link from "next/link";
import { homeHref } from "@/navigation/areas";

/**
 * A page that could not be shown: said in words, with a way to try again
 * once whatever stood in the way has passed (UX-INT-005). Nothing of the
 * error itself is shown; the server's log has it under its digest.
 */
export default function PageError({ retry }: { retry: () => void }) {
  return (
    <main>
      <h1>Siden kunne ikke vises</h1>
      <p>
        Noe gikk galt da siden skulle hentes. Ingenting du har gjort er tapt.
        Prøv igjen om litt.
      </p>
      <p className="actions">
        <button className="button button-primary" type="button" onClick={retry}>
          Prøv igjen
        </button>
        <Link className="button button-secondary" href={homeHref}>
          Til Hjem
        </Link>
      </p>
    </main>
  );
}
