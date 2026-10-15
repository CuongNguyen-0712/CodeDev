import { cn } from "@/lib/utils"
import { LuLoaderCircle } from "react-icons/lu"

function Spinner({
  className,
  ...props
}) {
  return (
    <LuLoaderCircle
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
