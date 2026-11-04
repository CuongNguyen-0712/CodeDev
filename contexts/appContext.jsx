'use client';

import { showAlert } from "@/components/ui/alert";

// Compatibility hook: callers only use showAlert, which is stateless (toasts live in Sonner's store).
// The sidebar state moved to stores/uiStore.js. One constant object: no subscription, no re-render.
const APP = { showAlert };

export const useApp = () => APP;
