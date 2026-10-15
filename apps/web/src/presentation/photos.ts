/** Why a chosen file could not be used as a photo. */
export type PhotoProblem =
  /** The bytes could not be read at all (a cloud-only file, say). */
  | "unreadable"
  /** A HEIC/HEIF photo this browser cannot decode. */
  | "heif"
  /** Not a photo this browser can decode. */
  | "undecodable";

const order: readonly PhotoProblem[] = ["unreadable", "heif", "undecodable"];

/** What happened and what helps, said of `subject`. */
const sentences: Record<
  PhotoProblem,
  (subject: string, plural: boolean) => string
> = {
  unreadable: (subject, plural) => {
    const they = plural ? "de" : "det";
    return `${subject} kunne ikke hentes fra enheten. Ligger ${they} bare i en skytjeneste, må ${they} lastes ned til enheten først.`;
  },
  heif: (subject, plural) => {
    const them = plural ? "dem" : "det";
    return `${subject} er i HEIC-format, som denne nettleseren ikke kan åpne. Lagre ${them} som JPEG og velg ${them} på nytt.`;
  },
  undecodable: (subject, plural) =>
    `${subject} kunne ikke åpnes. Velg ${plural ? "bilder" : "et bilde"} i JPEG, PNG eller WebP.`,
};

/**
 * Why chosen photos were left out, one sentence for each kind of problem.
 * `chosen` is how many were chosen together: one chosen photo is "Bildet".
 */
export function photoProblemText(
  problems: readonly PhotoProblem[],
  chosen: number,
): string | null {
  const texts = order.flatMap((problem) => {
    const count = problems.filter((each) => each === problem).length;
    if (count === 0) return [];
    const plural = count > 1;
    const subject =
      chosen === 1 ? "Bildet" : plural ? `${count} bilder` : "Ett bilde";

    return [sentences[problem](subject, plural)];
  });

  return texts.length > 0 ? texts.join(" ") : null;
}
