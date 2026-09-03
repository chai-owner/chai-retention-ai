// Client-side Paddle.js bootstrap. The client token ships in the bundle by
// design; the environment is derived from its prefix so preview (test) and
// published (live) builds stay correct after the build-time token swap.

import { resolvePaddlePrice } from "@/utils/payments.functions";
import type { PaddleEnv } from "@/lib/paddle-server.types";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

declare global {
  interface Window {
    Paddle: any;
  }
}

export function getPaddleEnvironment(): PaddleEnv {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
}

let paddleInitialized = false;

export async function initializePaddle(): Promise<void> {
  if (paddleInitialized) return;
  if (!clientToken) throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      // Paddle.js expects "production", not "live".
      window.Paddle.Environment.set(getPaddleEnvironment() === "sandbox" ? "sandbox" : "production");
      window.Paddle.Initialize({ token: clientToken });
      paddleInitialized = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Couldn't load the checkout. Please try again."));
    document.head.appendChild(script);
  });
}

/** Resolve a human-readable price ID (e.g. "core_monthly") to Paddle's internal ID. */
export async function getPaddlePriceId(priceId: string): Promise<string> {
  return resolvePaddlePrice({ data: { priceId, environment: getPaddleEnvironment() } });
}
