/** Origin where the ChAi app is hosted (custom domain on the Lovable deployment). */
export const APP_ORIGIN = "https://app.askchai.tech";

/** Legacy Lovable origin, still served and kept allow-listed for redirects. */
export const LEGACY_APP_ORIGIN = "https://chai-retention-ai.lovable.app";

/** Origin where the marketing site is hosted (Vercel). */
export const MARKETING_ORIGIN = "https://askchai.tech";

/** Sender domain used for transactional emails. */
export const EMAIL_SENDER_DOMAIN = "notify.askchai.tech";

/** From domain used for transactional emails. */
export const EMAIL_FROM_DOMAIN = "askchai.tech";

/** Canonical marketing host (www) used for canonical/og:url tags. */
export const MARKETING_WWW_ORIGIN = "https://www.askchai.tech";

/** Default social share image exported from the live homepage hero at 1200x630. */
export const OG_IMAGE_URL = `${MARKETING_WWW_ORIGIN}/social-share-hero.png`;

/** Self-referencing canonical + og:url tags for a marketing path (e.g. "/pricing"). */
export function canonicalHead(path: string) {
  const url = `${MARKETING_WWW_ORIGIN}${path === "/" ? "/" : path}`;
  return {
    meta: [{ property: "og:url", content: url }],
    links: [{ rel: "canonical", href: url }],
    url,
  };
}
