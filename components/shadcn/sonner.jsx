"use client"

import { LuCircleCheck, LuInfo, LuLoaderCircle, LuOctagonX, LuTriangleAlert } from "react-icons/lu"
import { Toaster as Sonner } from "sonner";

// The app ships a single light theme, so the toaster is pinned to it rather
// than following the OS colour scheme.
const Toaster = ({
  ...props
}) => {
  return (
    <Sonner
      theme="light"
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
