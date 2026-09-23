import { Badge } from "@/components/ui/badge";
import type { BundleStatus } from "@/lib/generated/prisma/client";

const STATUS_LABEL: Record<BundleStatus, string> = {
  draft: "Draft",
  active: "Active",
  inactive: "Inactive",
};

const STATUS_VARIANT: Record<BundleStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  active: "default",
  inactive: "secondary",
};

export function BundleStatusBadge({ status }: { status: BundleStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
