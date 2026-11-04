import { cn } from "@/lib/utils"

// muted-foreground/20 reads against every surface (about 2:1); bg-accent sat at 1.1:1.
function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted-foreground/20", className)}
      {...props}
    />
  )
}

export { Skeleton }
