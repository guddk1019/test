"use client";

import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-cyan-700 text-white hover:bg-cyan-800",
  secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50",
  danger: "bg-rose-700 text-white hover:bg-rose-800",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
};

export function Button({
  className,
  variant = "primary",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASS[variant],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
}
