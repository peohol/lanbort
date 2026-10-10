/**
 * The steps every intervention takes (PS-ADM-014, «Plattformforvaltning
 * v1»); passkey becomes a step of its own when the session's confirmation
 * no longer counts.
 */
export const interventionSteps = (passkey: boolean) =>
  passkey
    ? ["Velg", "Konsekvenser", "Begrunnelse", "Passkey", "Bekreft"]
    : ["Velg", "Konsekvenser", "Begrunnelse", "Bekreft"];
