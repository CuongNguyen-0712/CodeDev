import { apiRoute } from "@/lib/routeHandler";
import { onboardingService } from "@/services/onboarding.service";

// Roles, industries, goals, levels, languages: reference data from the database (public).
export const GET = apiRoute(() => onboardingService.getCatalog(), {
    context: "api/onboarding/catalog",
    auth: "none",
    cacheControl: "public, max-age=60, stale-while-revalidate=600",
});
