import { ConfirmAction } from "./confirm-action";

/**
 * Lifting a block (PS-USR-007), with what ends and what does not come back
 * (UX-INT-007): the same step on the person's page and in Konto › Blokkerte.
 */
export function UnblockAction({
  userId,
  name,
  label = "Opphev blokkeringen",
}: {
  userId: string;
  name: string;
  label?: string;
}) {
  return (
    <ConfirmAction
      label={label}
      title={`Oppheve blokkeringen av ${name}?`}
      consequences={{
        gone: [
          "Blokkeringen. Dere kan få kontakt igjen og se hverandre der dere begge er med.",
        ],
        stays: [
          "Vennskap og forespørsler som blokkeringen avsluttet, kommer ikke tilbake.",
        ],
        affects: [`${name} får ikke beskjed.`],
      }}
      confirmLabel="Opphev blokkeringen"
      path="/api/social/blocks/lift"
      body={{ userId }}
    />
  );
}
