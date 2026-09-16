// Single source of truth for "where does a signed-in user belong?".
// Used by the post-login redirect and by the protected-route gate so both
// behave identically.

export type DestinationProfile = {
  onboarded?: boolean | null;
  unlocked?: boolean | null;
} | null;

export const ONBOARDING_PATH = "/onboarding";
export const WELCOME_PATH = "/app/welcome";
export const TODAY_PATH = "/app/today";

// Pages a locked (onboarded but not yet unlocked) customer may still open.
export const LOCKED_ALLOWED_PATHS = new Set([
  "/app/welcome",
  "/app/settings",
  "/app/data",
  "/settings/account",
]);

/** Where a signed-in user should land straight after login. */
export function resolvePostLoginDestination(profile: DestinationProfile): string {
  if (!profile || profile.onboarded !== true) return ONBOARDING_PATH;
  if (profile.unlocked !== true) return WELCOME_PATH;
  return TODAY_PATH;
}

/**
 * Where a signed-in user must be sent when they try to open `pathname`,
 * or null when they may stay where they are.
 */
export function resolveGuardedDestination(
  profile: DestinationProfile,
  pathname: string,
): string | null {
  // The admin console is reachable regardless of onboarding state.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  if (!profile || profile.onboarded !== true) {
    return pathname === ONBOARDING_PATH ? null : ONBOARDING_PATH;
  }

  // Onboarding is done — never keep them in the flow.
  if (pathname === ONBOARDING_PATH) {
    return profile.unlocked === true ? TODAY_PATH : WELCOME_PATH;
  }

  if (profile.unlocked !== true) {
    return LOCKED_ALLOWED_PATHS.has(pathname) ? null : WELCOME_PATH;
  }

  // Unlocked users don't need the welcome/booking screen any more.
  if (pathname === WELCOME_PATH) return TODAY_PATH;
  return null;
}
