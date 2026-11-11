import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Replay Console — Session recording & module-wise replay" },
      {
        name: "description",
        content: "Record website sessions with rrweb and replay each page visit separately.",
      },
      { property: "og:title", content: "Replay Console" },
      {
        property: "og:description",
        content: "Record website sessions with rrweb and replay each page visit separately.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-brand text-sidebar-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20">
        <p className="text-sm uppercase tracking-[0.25em] text-sidebar-primary">
          rrweb · one script tag · any stack
        </p>
        <h1 className="mt-4 text-5xl leading-tight md:text-6xl">
          Replay every page visit, one module at a time.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-sidebar-foreground/80">
          Add one script tag to a website you own. Visits are recorded silently, split by page or
          module, and replayed here for authorised Admins. Replay rebuilds the page from recorded
          events — it is not a video.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link to="/login">Admin sign in</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-sidebar-primary bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Link to="/demo">Open the demo website</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
