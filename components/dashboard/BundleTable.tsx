import { BundleRowActions } from "@/components/dashboard/BundleRowActions";
import { BundleStatusBadge } from "@/components/dashboard/BundleStatusBadge";
import { formatRevenue } from "@/lib/analytics/metrics";
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

const formatBundleRevenue = (revenue: BundleListItem["revenue"]): string =>
  formatRevenue(revenue) ?? "—";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function ProductIssues({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="text-destructive block text-xs font-normal">
      {count} {count === 1 ? "product needs" : "products need"} attention
    </span>
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
                <TableCell className="text-foreground font-medium">
                  {bundle.title}
                  <ProductIssues count={bundle.productIssues} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {BUNDLE_TYPE_LABEL[bundle.bundleType]}
                </TableCell>
                <TableCell>
                  <BundleStatusBadge status={bundle.status} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatBundleRevenue(bundle.revenue)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(bundle.createdAt)}
                </TableCell>
                <TableCell>
                  <BundleRowActions
                    bundleId={bundle.id}
                    title={bundle.title}
                    status={bundle.status}
                  />
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
                <ProductIssues count={bundle.productIssues} />
              </div>
              <BundleRowActions bundleId={bundle.id} title={bundle.title} status={bundle.status} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <BundleStatusBadge status={bundle.status} />
              <span className="text-muted-foreground tabular-nums">
                {formatBundleRevenue(bundle.revenue)}
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
