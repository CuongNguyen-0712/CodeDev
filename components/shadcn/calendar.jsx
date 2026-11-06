'use client'

import { DayPicker } from "react-day-picker"
import { LuChevronLeft, LuChevronRight } from "react-icons/lu"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/shadcn/button"

// shadcn-style month grid on react-day-picker v9, styled only through classNames (no rdp stylesheet).
function Calendar({ className, classNames, showOutsideDays = true, ...props }) {
  const nav = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "aria-disabled:opacity-40")
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={{
        months: "relative flex flex-col gap-4",
        month: "flex w-full flex-col gap-2",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: nav,
        button_next: nav,
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "text-sm font-medium",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-[0.7rem] font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "size-9 p-0 text-center text-sm",
        day_button: "inline-flex size-9 items-center justify-center rounded-md tabular transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none",
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:font-semibold [&>button]:underline [&>button]:underline-offset-4",
        outside: "text-muted-foreground",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass }) =>
          orientation === "left"
            ? <LuChevronLeft className={cn("size-4", chevronClass)} aria-hidden="true" />
            : <LuChevronRight className={cn("size-4", chevronClass)} aria-hidden="true" />,
      }}
      {...props}
    />
  )
}

export { Calendar }
