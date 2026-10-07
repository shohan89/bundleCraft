import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface UpgradePromptProps {
  title: string;
  description: string;
}

/** Explains why something is unavailable on the current plan and links to the billing page. */
export function UpgradePrompt({ title, description }: UpgradePromptProps) {
  return (
    <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="bg-muted flex size-11 items-center justify-center rounded-full">
        <Lock className="text-muted-foreground size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      </div>
      <Button asChild className="mt-2">
        <Link href="/dashboard/billing">View plans</Link>
      </Button>
    </div>
  );
}
