import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-[opacity,transform,background-color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        gold: "bg-gold text-bg hover:bg-gold-bright shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gold)_50%,transparent)]",
        outline:
          "bg-transparent text-ink shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gold)_45%,transparent)] hover:bg-gold/10",
        ghost: "bg-transparent text-ink hover:bg-elevated",
        danger: "bg-danger text-ink hover:opacity-90",
        muted: "bg-elevated text-ink shadow-[0_0_0_1px_var(--color-line)] hover:bg-surface",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-lg",
        md: "h-11 px-4 text-sm rounded-xl",
        lg: "h-12 px-5 text-base rounded-xl min-h-11",
        icon: "size-11 rounded-xl",
      },
    },
    defaultVariants: { variant: "gold", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
