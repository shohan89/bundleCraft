import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { BundleStatusBadge } from "@/components/dashboard/BundleStatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BundleListItem } from "@/services/dashboard/bundles";

const BUNDLE_TYPE_LABEL: Record<BundleListItem["bundleType"], string> = {
  fixed: "Fixed bundle",
  quantity: "Quantity bundle",
  mix_match: "Mix & match",
};

function formatRevenue(revenue: number | null): string {
  if (revenue === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(revenue);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

/**
 * Duplicate/Delete/Publish are disabled here because the bundle engine
 * (ACTION-005) that would actually perform them doesn't exist yet — this
 * intentionally does not fake success. Edit links to a per-bundle route
 * that ACTION-005 will fill in.
 */
function BundleRowActions({ bundleId }: { bundleId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Bundle actions">
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/bundles/${bundleId}`}>Edit</Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="Available once the bundle engine launches">
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="Available once the bundle engine launches">
          Publish
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled
          variant="destructive"
          title="Available once the bundle engine launches"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BundleTable({ bundles }: { bundles: BundleListItem[] }) {
  return (
    <>
      {/* Desktop/tablet: real table. Hidden below sm so it never forces horizontal scroll on phones. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bundle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundles.map((bundle) => (
              <TableRow key={bundle.id}>
                <TableCell className="text-foreground font-medium">{bundle.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {BUNDLE_TYPE_LABEL[bundle.bundleType]}
                </TableCell>
                <TableCell>
                  <BundleStatusBadge status={bundle.status} />
                </TableCell>
                <TableCell className="tabular-nums">{formatRevenue(bundle.revenue)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(bundle.createdAt)}
                </TableCell>
                <TableCell>
                  <BundleRowActions bundleId={bundle.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: card list instead of a cramped/scrolling table. */}
      <ul className="space-y-3 sm:hidden">
        {bundles.map((bundle) => (
          <li key={bundle.id} className="border-border rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-foreground font-medium">{bundle.title}</p>
                <p className="text-muted-foreground text-sm">
                  {BUNDLE_TYPE_LABEL[bundle.bundleType]}
                </p>
              </div>
              <BundleRowActions bundleId={bundle.id} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <BundleStatusBadge status={bundle.status} />
              <span className="text-muted-foreground tabular-nums">
                {formatRevenue(bundle.revenue)}
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Created {formatDate(bundle.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
