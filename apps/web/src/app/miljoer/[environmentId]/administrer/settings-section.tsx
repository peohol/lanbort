import type { Environment } from "@lanbort/contracts";
import { AreaField } from "@/components/area-field";
import { CommandForm } from "@/components/command-form";
import { describedBy, Field } from "@/components/field";
import { requirementsChangeNote } from "@/presentation/environment-admin";
import { EnvironmentArea } from "../about";
import { RequirementsEditor } from "./requirements-editor";

const textFields = [
  { name: "description", label: "Beskrivelse", max: 2000, lines: 4 },
  { name: "audience", label: "Hvem miljøet er for", max: 500, lines: 2 },
  {
    name: "objectFocus",
    label: "Hva slags ting dere låner ut",
    max: 500,
    lines: 2,
  },
] as const;

/**
 * Name, details, area and requirements (PS-ENV-001, PS-ENV-005–006, WP-62).
 * The details are saved together, based on the version the administrator
 * saw, so nobody overwrites another's change unknowingly. An area removed
 * in the form is saved as none.
 */
export function SettingsSection({ environment }: { environment: Environment }) {
  const area = environment.area;

  return (
    <section aria-labelledby="innstillinger">
      <h2 id="innstillinger">Innstillinger</h2>
      <h3>Navn, beskrivelse og område</h3>
      <p>
        {area
          ? `Miljøet vises i Finn for søk innen ${area.radiusKm} km fra området.`
          : "Miljøet har ikke noe område, så det finnes ikke ved søk nær et sted."}
      </p>
      <EnvironmentArea environment={environment} />
      <CommandForm
        key={environment.version}
        path="/api/environments/details"
        fixed={{
          environmentId: environment.id,
          expectedVersion: environment.version,
        }}
        submitLabel="Lagre innstillingene"
        secondary
      >
        <Field id="miljo-navn" label="Navn">
          <input
            id="miljo-navn"
            name="name"
            defaultValue={environment.name}
            maxLength={100}
            required
          />
        </Field>
        {textFields.map(({ name, label, max, lines }) => (
          <Field key={name} id={`miljo-${name}`} label={`${label} (valgfritt)`}>
            <textarea
              id={`miljo-${name}`}
              name={name}
              defaultValue={environment[name] ?? ""}
              maxLength={max}
              rows={lines}
            />
          </Field>
        ))}
        <Field id="miljo-sted" label="Sted i ord (valgfritt)" help={placeHelp}>
          <input
            id="miljo-sted"
            name="location"
            defaultValue={environment.location ?? ""}
            maxLength={200}
            {...describedBy("miljo-sted", placeHelp)}
          />
        </Field>
        <AreaField initial={area} />
      </CommandForm>
      <h3>Krav for å bli med</h3>
      <RequirementsEditor
        key={environment.requirementsRevision}
        environmentId={environment.id}
        revision={environment.requirementsRevision}
        requirements={environment.requirements}
        changeNote={requirementsChangeNote}
      />
    </section>
  );
}

const placeHelp = "For eksempel et nabolag eller en bydel.";
