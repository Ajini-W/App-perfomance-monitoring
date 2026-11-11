import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [{ title: "Home — Demo Shop" }, { name: "replay-module", content: "Home" }],
  }),
  component: DemoHome,
});

function DemoHome() {
  const [n, setN] = useState(0);
  return (
    <div className="space-y-4">
      <h1 className="text-4xl">Welcome to Demo Shop</h1>
      <p className="text-muted-foreground">
        Click around, then move between pages. Each page becomes its own replay segment.
      </p>
      <Button onClick={() => setN(n + 1)}>Clicked {n} times</Button>
    </div>
  );
}
