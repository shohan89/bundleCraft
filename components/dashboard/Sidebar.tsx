"use client";

import { BarChart3, Package, PlusCircle, Settings, ShoppingBag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: ShoppingBag,
    isActive: (pathname) => pathname === "/dashboard",
  },
  {
    label: "Bundles",
    href: "/dashboard/bundles",
    icon: Package,
    isActive: (pathname) => pathname === "/dashboard/bundles",
  },
  {
    label: "Create Bundle",
    href: "/dashboard/bundles/create",
    icon: PlusCircle,
    isActive: (pathname) => pathname.startsWith("/dashboard/bundles/create"),
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    isActive: (pathname) => pathname.startsWith("/dashboard/analytics"),
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    isActive: (pathname) => pathname.startsWith("/dashboard/settings"),
  },
];

interface NavLinksProps {
  onNavigate?: () => void;
}

export function NavLinks({ onNavigate }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard navigation" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="border-border bg-background hidden w-56 shrink-0 border-r md:flex md:flex-col md:gap-6 md:px-3 md:py-6">
      <div className="px-3">
        <span className="text-foreground text-base font-semibold">BundleCraft</span>
      </div>
      <NavLinks />
    </aside>
  );
}
