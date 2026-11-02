import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover shadow-[0_1px_2px_rgb(0_0_0/0.12)] disabled:opacity-40 disabled:hover:bg-accent",
  secondary: "bg-surface text-text border border-border-strong hover:bg-surface-muted",
  ghost: "text-accent hover:bg-accent-soft",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition-colors duration-150 outline-none focus-visible:ring-4 focus-visible:ring-accent-soft disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export type Tone = "success" | "warning" | "danger" | "neutral" | "accent";

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-muted text-text-secondary border border-border",
  accent: "bg-accent-soft text-accent",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-3xl border border-border bg-surface shadow-card ${className}`}>{children}</div>;
}

export function SectionTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="mb-4">
      {eyebrow && (
        <p className="mb-1 text-[12px] font-medium tracking-[0.06em] text-text-tertiary uppercase">{eyebrow}</p>
      )}
      <h2 className="font-display text-[22px] font-semibold tracking-[-0.01em]">{title}</h2>
    </div>
  );
}
