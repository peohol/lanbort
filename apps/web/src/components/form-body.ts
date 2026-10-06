/** One named value a form sends, as the browser reads it. */
export interface FormValue {
  readonly name: string;
  readonly value: string | number | boolean;
}

/**
 * The JSON body of a form: dotted names nest (`start.kind`), names that end
 * in `[]` collect a list, and empty text is left out, so an optional field
 * the user left empty is not sent. `fixed` holds what the page decided, such
 * as the id the command is about; the user's fields cannot replace it.
 */
export function formBody(
  values: readonly FormValue[],
  fixed: Record<string, unknown> = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const { name, value } of values) {
    if (value === "") continue;
    const list = name.endsWith("[]");
    const path = (list ? name.slice(0, -2) : name).split(".");
    const last = path.pop()!;
    let target = body;

    for (const key of path) {
      const next = target[key];
      target = (
        next && typeof next === "object" ? next : (target[key] = {})
      ) as Record<string, unknown>;
    }

    if (list) {
      const current = target[last];
      target[last] = Array.isArray(current) ? [...current, value] : [value];
    } else {
      target[last] = value;
    }
  }

  return { ...body, ...fixed };
}

/**
 * What a form's controls hold: a checkbox as true or false, a number field
 * as a number, only the chosen radio button, and nothing that is disabled.
 */
export function formValues(form: HTMLFormElement): FormValue[] {
  const values: FormValue[] = [];

  for (const element of Array.from(form.elements)) {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !element.name ||
      element.disabled
    ) {
      continue;
    }

    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" && !element.name.endsWith("[]")) {
        values.push({ name: element.name, value: element.checked });
        continue;
      }
      if (
        (element.type === "checkbox" || element.type === "radio") &&
        !element.checked
      ) {
        continue;
      }
      if (element.type === "number" && element.value !== "") {
        values.push({ name: element.name, value: element.valueAsNumber });
        continue;
      }
    }

    if (element instanceof HTMLSelectElement && element.multiple) {
      for (const option of Array.from(element.selectedOptions)) {
        values.push({ name: element.name, value: option.value });
      }
      continue;
    }

    values.push({ name: element.name, value: element.value });
  }

  return values;
}

/**
 * The page to go to after a command, from a template such as
 * `/lan/foresporsel/{requestId}` filled from the command's answer.
 */
export function fillHref(template: string, data: unknown): string {
  const fields = (data ?? {}) as Record<string, unknown>;

  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    encodeURIComponent(String(fields[key] ?? "")),
  );
}
