"use client"

import * as React from "react"
import { EmojiPicker as EmojiPickerPrimitive } from "frimousse"
import { LuLoader } from "react-icons/lu"

import { cn } from "@/lib/utils"

// The only file that imports frimousse. Load it with next/dynamic (ssr: false) so the emoji data and the
// picker stay out of the shared chunks.
function EmojiPicker({
  className,
  ...props
}) {
  return (
    <EmojiPickerPrimitive.Root
      data-slot="emoji-picker"
      className={cn("isolate flex h-full w-fit flex-col overflow-hidden rounded-md bg-popover text-popover-foreground", className)}
      {...props}
    >
      <EmojiPickerPrimitive.Search
        data-slot="emoji-picker-search"
        placeholder="Search emoji"
        aria-label="Search emoji"
        className="z-10 mx-2 mt-2 appearance-none rounded-md bg-muted px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <EmojiPickerPrimitive.Viewport data-slot="emoji-picker-viewport" className="relative flex-1 outline-hidden">
        <EmojiPickerPrimitive.Loading className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <LuLoader aria-hidden="true" className="size-4 animate-spin" />
        </EmojiPickerPrimitive.Loading>
        <EmojiPickerPrimitive.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          No emoji found.
        </EmojiPickerPrimitive.Empty>
        <EmojiPickerPrimitive.List
          className="pb-1 select-none"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="bg-popover px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-accent"
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPickerPrimitive.Viewport>
    </EmojiPickerPrimitive.Root>
  )
}

export { EmojiPicker }
