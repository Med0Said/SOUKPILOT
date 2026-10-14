import type { ButtonHTMLAttributes, Ref } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
  ghost: "text-foreground hover:bg-background",
};

/** Shared classes so links can look like buttons. Min height 44px for touch. */
export function buttonClasses(variant: Variant = "primary", extra = ""): string {
  return [
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium",
    "transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    extra,
  ].join(" ");
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; ref?: Ref<HTMLButtonElement> }) {
  return <button ref={ref} type={type} className={buttonClasses(variant, className)} {...props} />;
}
