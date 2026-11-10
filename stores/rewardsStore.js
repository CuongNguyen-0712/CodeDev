import { create } from "zustand";

/**
 * Reward moments after a lesson or challenge (components/ui/level.jsx announceRewards,
 * components/course/ratePromptDialog.jsx askForRating). Naming and structure rules:
 * docs/state-management.md.
 */
export const useRewardsStore = create((set) => ({
    levelUp: null,      // { level, previousLevel } while the level-up dialog is open
    ratePrompt: null,   // { courseId, milestone } while the course rating prompt is wanted
    rewardsSeq: 0,      // bumped on every points / EXP award; RankUpWatcher refetches the ranks

    // A second moment of the same kind replaces the first (one completion per click on the server).
    showLevelUp: (levelUp) => set({ levelUp }),
    closeLevelUp: () => set({ levelUp: null }),
    askForRating: (ratePrompt) => set({ ratePrompt }),
    closeRatePrompt: () => set({ ratePrompt: null }),
    bumpRewards: () => set((s) => ({ rewardsSeq: s.rewardsSeq + 1 })),
}));

// The rating prompt waits behind the level-up dialog of the same completion.
export const selectRatePromptOpen = (s) => Boolean(s.ratePrompt) && !s.levelUp;
