"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  shopDomain: string;
  onOpenMobileNav: () => void;
}

/**
 * Persistent top bar across every dashboard page (distinct from
 * PageHeader, which is the per-page title below it). Shows the
 * authenticated shop's own domain — never anything from client input.
 */
export function Header({ shopDomain, onOpenMobileNav }: HeaderProps) {
  return (
    <header className="border-border bg-background flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
        onClick={onOpenMobileNav}
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>
      <span className="text-foreground text-base font-semibold md:hidden">BundleCraft</span>
      <div className="text-muted-foreground ml-auto text-sm">{shopDomain}</div>
    </header>
  );
}
