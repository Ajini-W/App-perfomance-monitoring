import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demo Shop — recorded test website" },
      {
        name: "description",
        content: "A sample website that loads the recording script, for testing.",
      },
      { property: "og:title", content: "Demo Shop" },
      {
        property: "og:description",
        content: "A sample website that loads the recording script, for testing.",
      },
    ],
  }),
  component: DemoLayout,
});

/** Simulates a customer's website: it loads the SDK exactly like any other site would. */
function DemoLayout() {
  useEffect(() => {
    if (document.getElementById("replay-sdk")) return;
    const s = document.createElement("script");
    s.id = "replay-sdk";
    s.src = "/sdk/recorder.js";
    s.setAttribute("data-site-key", "demo-site-key");
    document.body.appendChild(s);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <nav className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4 text-sm">
          <span className="font-display text-lg text-primary">Demo Shop</span>
          <Link
            to="/demo"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-primary font-bold" }}
          >
            Home
          </Link>
          <Link to="/demo/products" activeProps={{ className: "text-primary font-bold" }}>
            Products
          </Link>
          <Link to="/demo/checkout" activeProps={{ className: "text-primary font-bold" }}>
            Checkout
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="mb-6 rounded-md bg-muted px-4 py-2 text-xs text-muted-foreground">
          Privacy notice: this demo site records your interactions for replay testing. Typed values
          are masked.
        </p>
        <Outlet />
      </main>
    </div>
  );
}
