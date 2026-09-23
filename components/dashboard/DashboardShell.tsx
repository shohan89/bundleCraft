"use client";

import { useState, type ReactNode } from "react";
import { Header } from "@/components/dashboard/Header";
import { NavLinks, Sidebar } from "@/components/dashboard/Sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface DashboardShellProps {
  shopDomain: string;
  children: ReactNode;
}

export function DashboardShell({ shopDomain, children }: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 px-3 py-6">
          <SheetHeader className="px-3">
            <SheetTitle>BundleCraft</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <NavLinks onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header shopDomain={shopDomain} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
