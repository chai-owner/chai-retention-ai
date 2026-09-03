import { getPaddleEnvironment } from "@/lib/paddle";

/** Visible only while the app runs against the test payment environment. */
export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;

  return (
    <div className="w-full border-b border-warning/30 bg-warning/15 px-4 py-2 text-center text-sm text-warning-foreground">
      All payments made in the preview are in test mode.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline"
      >
        Read more
      </a>
    </div>
  );
}
