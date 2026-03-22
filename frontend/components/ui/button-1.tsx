import * as React from "react";
import clsx from "clsx";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // Using explicit type string union (ignoring HTML's default "submit" | "button" conflicts by separating them visually)
  type?: "primary" | "secondary" | "tertiary" | any;
  size?: "small" | "medium" | "large";
  svgOnly?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, type = "primary", size = "medium", svgOnly, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={clsx(
          "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
          {
            "bg-[#fff] text-[#000] hover:bg-[#eee]": type === "primary",
            "bg-transparent text-[#fff] border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)]": type === "secondary",
            "bg-transparent text-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#fff]": type === "tertiary",
            "h-10 py-2 px-4": size === "medium" && !svgOnly,
            "h-8 px-3 rounded-md text-xs": size === "small" && !svgOnly,
            "h-11 px-8 rounded-md": size === "large" && !svgOnly,
            "h-8 w-8 !p-0": svgOnly,
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
