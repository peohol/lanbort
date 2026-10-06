"use client";

import {
  type AreaRadiusKm,
  areaRadiusKmOptions,
  type GeoArea,
  type PlaceOption,
  type PlaceOptions,
} from "@lanbort/contracts";
import { type KeyboardEvent, useId, useState } from "react";
import { getJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { ErrorText } from "./error-text";
import { errorMessage } from "./error-messages";

const defaultRadiusKm: AreaRadiusKm = 2;

const placeSearchMessages = {
  unavailable:
    "Stedssøket svarer ikke akkurat nå. Prøv igjen om litt, eller la området stå tomt.",
};

/**
 * An approximate area in a form (WP-62): a place found by name and how far
 * around it, sent as `name.latitude`, `name.longitude` and `name.radiusKm`,
 * or nothing at all. Never an address or an exact point (PS-NFR-008): the
 * server makes every place coarse before it comes back. The controls that
 * only help choose have no names, so the form sends just the area.
 */
export function AreaField({
  name = "area",
  initial = null,
}: {
  name?: string;
  initial?: GeoArea | null;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [options, setOptions] = useState<readonly PlaceOption[]>([]);
  const [chosen, setChosen] = useState<Omit<PlaceOption, "label"> | null>(
    initial,
  );
  const [label, setLabel] = useState<string | null>(
    initial ? "Området som er satt nå" : null,
  );
  const [radiusKm, setRadiusKm] = useState<AreaRadiusKm>(
    initial?.radiusKm ?? defaultRadiusKm,
  );
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function choose(option: PlaceOption | undefined) {
    setChosen(option ?? null);
    setLabel(option?.label ?? null);
  }

  async function search() {
    if (searching) return;
    if (text.trim().length < 2) {
      setProblem("Skriv minst to tegn i stedet.");
      return;
    }

    setSearching(true);
    setProblem(null);
    const result = await getJson<PlaceOptions>(
      `/api/places?${new URLSearchParams({ sted: text.trim() })}`,
    );
    setSearching(false);

    if (!result.ok) {
      setProblem(errorMessage(result.code, placeSearchMessages));
      return;
    }

    setOptions(result.data.places);
    choose(result.data.places[0]);

    if (result.data.places.length === 0) {
      setProblem(`Fant ikke noe sted som heter «${text.trim()}».`);
    }
  }

  // Enter in the place field looks the place up instead of sending the form.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void search();
    }
  }

  return (
    <fieldset>
      <legend>Område (valgfritt)</legend>
      <p className="help" id={`${id}-hjelp`}>
        Et omtrentlig område gjør at folk i nærheten kan finne miljøet. Det
        vises som en sirkel på kartet, aldri som en adresse.
      </p>
      <label htmlFor={`${id}-sted`}>Sted</label>
      <input
        id={`${id}-sted`}
        type="search"
        value={text}
        maxLength={100}
        autoComplete="off"
        aria-describedby={`${id}-hjelp`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="actions">
        <BusyButton
          type="button"
          className="button-secondary"
          busy={searching}
          busyNote="søker …"
          onClick={() => void search()}
        >
          Finn stedet
        </BusyButton>
      </div>
      <ErrorText>{problem}</ErrorText>
      {options.length > 1 && (
        <>
          <label htmlFor={`${id}-valg`}>Hvilket sted?</label>
          <select
            id={`${id}-valg`}
            value={options.findIndex(
              (option) =>
                option.latitude === chosen?.latitude &&
                option.longitude === chosen?.longitude,
            )}
            onChange={(event) => choose(options[Number(event.target.value)])}
          >
            {options.map((option, index) => (
              <option key={option.label} value={index}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      )}
      {chosen && (
        <>
          <p role="status">Rundt {label}</p>
          <label htmlFor={`${id}-radius`}>Hvor stort</label>
          <select
            id={`${id}-radius`}
            value={radiusKm}
            onChange={(event) =>
              setRadiusKm(Number(event.target.value) as AreaRadiusKm)
            }
          >
            {areaRadiusKmOptions.map((km) => (
              <option key={km} value={km}>
                {`Innen ${km} km`}
              </option>
            ))}
          </select>
          <input
            type="hidden"
            name={`${name}.latitude`}
            value={chosen.latitude}
          />
          <input
            type="hidden"
            name={`${name}.longitude`}
            value={chosen.longitude}
          />
          <input type="hidden" name={`${name}.radiusKm`} value={radiusKm} />
          <div className="actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setOptions([]);
                choose(undefined);
              }}
            >
              Fjern området
            </button>
          </div>
        </>
      )}
    </fieldset>
  );
}
