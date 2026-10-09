"use client";

import styles from "./loan.module.css";

/**
 * One choice of two or three, side by side (KF1 v2): «Velg dag» or «Så
 * snart som mulig». Radio buttons underneath, so the keyboard and a screen
 * reader treat it as the choice it is.
 */
export function Choice<Value extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: Value;
  options: readonly { readonly value: Value; readonly label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className={styles.choice}>
      <legend>{legend}</legend>
      <div className={styles.segments}>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
