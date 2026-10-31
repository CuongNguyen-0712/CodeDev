import { serve } from "inngest/next";

import { functions } from "@/jobs";
import { inngest } from "@/lib/inngest";

// One step runs at most a code run (lib/challenges/limits.js MAX_JOB_MS = 120s) plus grading.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Inngest calls this route to run every step; serve() checks INNGEST_SIGNING_KEY. */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
