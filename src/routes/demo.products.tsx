import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const items = ["Chilli Sauce", "Peach Jam", "Ruby Tea", "Clay Mug"];

export const Route = createFileRoute("/demo/products")({
  head: () => ({ meta: [{ title: "Products — Demo Shop" }] }),
  component: DemoProducts,
});

function DemoProducts() {
  const [cart, setCart] = useState<string[]>([]);
  return (
    <div className="space-y-6">
      <h1 className="text-4xl">Products</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((i) => (
          <div key={i} className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="text-lg">{i}</h3>
            <Button size="sm" className="mt-3" onClick={() => setCart([...cart, i])}>
              Add to cart
            </Button>
          </div>
        ))}
      </div>
      <p className="text-sm">Cart: {cart.join(", ") || "empty"}</p>
    </div>
  );
}
