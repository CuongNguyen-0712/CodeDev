"use client"

import { LuCircleCheck, LuInfo, LuLoaderCircle, LuOctagonX, LuTriangleAlert } from "react-icons/lu"
import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/contexts/themeContext";

// Follows the app's own light / dark switch (contexts/themeContext.jsx), not the OS setting.
const Toaster = ({
  ...props
}) => {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme === "dark" ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: <LuCircleCheck className="size-4 text-success" />,
        info: <LuInfo className="size-4 text-info" />,
        warning: <LuTriangleAlert className="size-4 text-warning" />,
        error: <LuOctagonX className="size-4 text-destructive" />,
        loading: <LuLoaderCircle className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)"
        }
      }
      {...props}
    />
  );
}

export { Toaster }
