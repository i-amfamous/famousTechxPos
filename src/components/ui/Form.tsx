import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { LuSearch } from "react-icons/lu";
import { cn } from "@/lib/format";

const control =
  "block w-full rounded-lg border-0 bg-white text-sm text-ink-900 shadow-sm ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 disabled:bg-ink-50 disabled:text-ink-500";

export function Field({
  label, hint, error, required, children, className, htmlFor,
}: { label?: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-700">
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode; error?: string; prefix?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, prefix, className, id, required, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-500">{prefix}</span>}
        <input
          ref={ref}
          id={fid}
          required={required}
          aria-invalid={!!error || undefined}
          className={cn(control, "h-10 px-3", prefix ? "pl-12" : "", error && "ring-rose-400 focus:ring-rose-500")}
          {...rest}
        />
      </div>
    </Field>
  );
});

export function Select({ label, hint, error, className, id, children, required, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: ReactNode; error?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>
      <select id={fid} required={required} className={cn(control, "h-10 pl-3 pr-8")} {...rest}>
        {children}
      </select>
    </Field>
  );
}

export function Textarea({ label, hint, error, className, id, required, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: ReactNode; error?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>
      <textarea id={fid} required={required} rows={3} className={cn(control, "px-3 py-2")} {...rest} />
    </Field>
  );
}

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input type="search" className={cn(control, "h-10 pl-9 pr-3")} {...rest} />
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <div>
          {label && <label htmlFor={id} className="text-sm font-medium text-ink-800">{label}</label>}
          {description && <p className="text-xs text-ink-500">{description}</p>}
        </div>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-brand-600" : "bg-ink-300",
        )}
      >
        <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={rest.id ?? id} className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700", className)}>
      <input id={rest.id ?? id} type="checkbox" className="size-4 rounded border-ink-300 accent-brand-600" {...rest} />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "md" | "lg" }) {
  return (
    <div className="inline-flex rounded-lg bg-ink-100 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "lg" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-sm",
            value === o.value ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
