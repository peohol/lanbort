import { Icon } from "./icon";

/**
 * The words to search for, in one large field with its button (UX-P20), as
 * on Finn and «Søk i …» on an environment's page. The label is read by
 * assistive technology and shown as the placeholder; it sits in an ordinary
 * GET form, so the button searches without a script too.
 */
export function SearchField({
  id,
  label,
  name = "q",
  defaultValue,
}: {
  id: string;
  label: string;
  name?: string;
  defaultValue?: string;
}) {
  return (
    <div className="search-field">
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <Icon name="find" />
      <input
        id={id}
        name={name}
        type="search"
        defaultValue={defaultValue}
        maxLength={100}
        autoComplete="off"
        placeholder={label}
      />
      <button type="submit" className="button-primary">
        Søk
      </button>
    </div>
  );
}
