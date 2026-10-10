"use client";

import "./globals.css";

/**
 * When even the app's frame could not be shown: its own document, in the
 * same words as a page that failed (`error.tsx`).
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="nb">
      <body>
        <title>Lånbort er utilgjengelig</title>
        <main>
          <h1>Lånbort kunne ikke vises</h1>
          <p>
            Noe gikk galt da siden skulle hentes. Ingenting du har gjort er
            tapt. Prøv igjen om litt.
          </p>
          <p>
            <button
              className="button button-primary"
              type="button"
              onClick={retry}
            >
              Prøv igjen
            </button>
          </p>
        </main>
      </body>
    </html>
  );
}
