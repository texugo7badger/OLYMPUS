"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * Olympus Switch (Toggle) — P6 fix.
 *
 *  - Track turns Olympus gold (#D4A574) when ON (not default primary white).
 *  - Thumb is perfectly centered: 2px gap on all sides in both ON/OFF states.
 *  - Track: 36px × 20px (w-9 h-5). Thumb: 16px (size-4).
 *  - Unchecked: translate-x-[2px] (2px left gap).
 *  - Checked: translate-x-[18px] (36 - 16 - 2 = 18px → 2px right gap).
 *  - Vertical: (20 - 16) / 2 = 2px top/bottom (via items-center).
 *
 * P6 FIX — removed the 1px transparent border from the Root. The previous
 * border added 1px to the inner width calculation, causing the thumb to
 * kiss the right edge by 1px in the checked state (asymmetric). With no
 * border, the math is clean:
 *   - Track inner width = 36px
 *   - Thumb width = 16px
 *   - Total travel = 36 - 16 - 4 (2px gap each side) = 16px
 *   - Unchecked: translate-x-[2px] → thumb left edge at 2px (2px gap left)
 *   - Checked:   translate-x-[18px] → thumb right edge at 34px (2px gap right)
 * Both states have a perfect 2px gap on each side. Verified visually.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full shadow-xs transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-olympus-gold data-[state=unchecked]:bg-[#1e2530]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform",
          "data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-[2px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
