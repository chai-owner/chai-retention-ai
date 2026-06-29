// Persists the answers gathered during onboarding so other parts of the app
// (notably the Data & Integrations page) can adapt to how the user's business
// works. Backed by localStorage and exposed via useSyncExternalStore, mirroring
// the uploads-store pattern. SSR-safe: returns null on the server.
import { useSyncExternalStore } from "react";

export interface ProfileSegment {
  name: string;
  min: string;
  max: string;
}

export interface OnboardingProfile {
  company: string;
  industry: string;
  model: string;
  size?: string;
  customers?: string;
  avgValue?: string;
  whatBuy?: string;
  cadence?: string;
  lifespan?: string;
  concerns?: string;
  segments: ProfileSegment[];
  successActions: string;
  disengagement: string;
  tracked: Record<string, boolean>;
  channels: string[];
  // Importance (1–5) the user assigns to each health metric during onboarding.
  metricWeights?: Record<string, number>;
}

const STORAGE_KEY = "chai.onboarding.profile";

function read(): OnboardingProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OnboardingProfile) : null;
  } catch {
    return null;
  }
}

let profile: OnboardingProfile | null = read();

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export const profileStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot(): OnboardingProfile | null {
    return profile;
  },
  getServerSnapshot(): OnboardingProfile | null {
    return null;
  },
  save(next: OnboardingProfile) {
    profile = next;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore write failures (private mode / quota)
      }
    }
    emit();
  },
  clear() {
    profile = null;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    emit();
  },
};

export function useProfile(): OnboardingProfile | null {
  return useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );
}
