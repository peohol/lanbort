import type { Metadata } from "next";
import Link from "next/link";
import { homeHref } from "@/navigation/areas";

export const metadata: Metadata = { title: "Finnes ikke – Lånbort" };

/**
 * Every page that is not there for the caller: one that never existed, one
 * that is gone, and one the caller may not see look the same, so the page
 * says nothing about which (PS-NFR-002).
 */
export default function NotFound() {
  return (
    <main>
      <h1>Finnes ikke</h1>
      <p>
        Denne siden finnes ikke, eller du har ikke tilgang til den. Den kan være
        flyttet eller fjernet.
      </p>
      <p>
        <Link className="button button-primary" href={homeHref}>
          Til Hjem
        </Link>
      </p>
    </main>
  );
}
