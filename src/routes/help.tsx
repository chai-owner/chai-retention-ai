import { createFileRoute, Outlet, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/help")({
  component: HelpLayout,
});

function HelpLayout() {
  return (
    <div className="landing min-h-screen">
      <header className="mx-auto flex max-w-[1000px] items-center justify-between px-6 py-6 lg:px-8">
        <Link to="/" className="rounded-[8px]">
          <img src="/logo-dark.png" alt="ChAi" className="h-10 w-auto" />
        </Link>
        <nav className="flex items-center gap-6 text-sm text-[#4A5A6B]">
          <Link to="/help" className="rounded-[8px] hover:text-[#204654]">
            Help Center
          </Link>
          <Link to="/pricing" className="rounded-[8px] hover:text-[#204654]">
            Pricing
          </Link>
        </nav>
      </header>

      <Outlet />

      <footer className="mx-auto max-w-[1000px] px-6 pb-12 lg:px-8">
        <div className="border-t border-[#D8E7EF] pt-8 text-sm text-[#4A5A6B]">
          Need a hand? Email{" "}
          <a
            className="font-medium text-[#204654] underline underline-offset-2"
            href="mailto:support@askchai.tech"
          >
            support@askchai.tech
          </a>
          .
        </div>
      </footer>
    </div>
  );
}
