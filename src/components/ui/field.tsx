import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const CONTROL =
  "block w-full min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-foreground " +
  "placeholder:text-muted/70 aria-[invalid=true]:border-danger disabled:opacity-60";

type FieldShellProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function TextField({
  id,
  label,
  hint,
  error,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        name={input.name ?? id}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  ...select
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        name={select.name ?? id}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  ...textarea
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        name={textarea.name ?? id}
        rows={3}
        className={`${CONTROL} py-2`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...textarea}
      />
    </FieldShell>
  );
}

/** Checkbox submitting "on" when checked (absent = unchecked). */
export function CheckboxField({
  id,
  label,
  hint,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & { id: string; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={input.name ?? id}
        type="checkbox"
        className="mt-0.5 size-6 shrink-0 accent-[var(--primary)]"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
