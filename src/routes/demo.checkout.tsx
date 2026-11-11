import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/demo/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Demo Shop" }] }),
  component: () => (
    <form className="max-w-md space-y-4" onSubmit={(e) => e.preventDefault()}>
      <h1 className="text-4xl">Checkout</h1>
      <p className="text-sm text-muted-foreground">
        Type anything — in the replay these values appear as ***.
      </p>
      <div className="space-y-1">
        <Label>Email</Label>
        <Input type="email" autoComplete="off" />
      </div>
      <div className="space-y-1">
        <Label>Password</Label>
        <Input type="password" autoComplete="off" />
      </div>
      <div className="space-y-1">
        <Label>Card number</Label>
        <Input inputMode="numeric" autoComplete="off" />
      </div>
      <p className="rr-block rounded-md bg-muted p-3 text-sm">
        This box has class "rr-block" and is hidden from recordings.
      </p>
      <Button type="submit">Pay (demo)</Button>
    </form>
  ),
});
