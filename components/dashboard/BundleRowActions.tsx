"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, type ApiFailure, type ApiResult } from "@/lib/api/client";
import { canDeactivate, canEdit, canPublish } from "@/lib/bundles/rules";
import type { BundleStatus } from "@/lib/bundles/types";

interface BundleRowActionsProps {
  bundleId: string;
  title: string;
  status: BundleStatus;
}

/**
 * Row actions call the bundle API and refresh the list. Which actions are
 * offered follows the shared lifecycle rules, but the server still makes
 * the real decision (and validates publish) — a rejected action is shown
 * to the merchant, never assumed to have worked.
 */
export function BundleRowActions({ bundleId, title, status }: BundleRowActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [failure, setFailure] = useState<{ action: string; error: ApiFailure } | null>(null);

  async function run(action: string, request: () => Promise<ApiResult<unknown>>) {
    setPending(true);
    const result = await request();
    setPending(false);
    setConfirmingDelete(false);
    if (!result.ok) {
      setFailure({ action, error: result.error });
      return;
    }
    router.refresh();
  }

  const base = `/api/bundles/${bundleId}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${title}`}
            disabled={pending}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit(status) ? (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/bundles/${bundleId}`}>Edit</Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled title="Deactivate this bundle to edit it">
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => run("duplicate", () => apiRequest("POST", `${base}/duplicate`))}
          >
            Duplicate
          </DropdownMenuItem>
          {canPublish(status) ? (
            <DropdownMenuItem
              onSelect={() => run("publish", () => apiRequest("POST", `${base}/publish`))}
            >
              Publish
            </DropdownMenuItem>
          ) : null}
          {canDeactivate(status) ? (
            <DropdownMenuItem
              onSelect={() => run("deactivate", () => apiRequest("POST", `${base}/deactivate`))}
            >
              Deactivate
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{title}&rdquo;?</DialogTitle>
            <DialogDescription>
              This permanently removes the bundle and its settings. Your Shopify products
              aren&apos;t affected. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run("delete", () => apiRequest("DELETE", base))}
            >
              {pending ? "Deleting…" : "Delete bundle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={failure !== null} onOpenChange={(open) => (open ? null : setFailure(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Couldn&apos;t {failure?.action} this bundle</DialogTitle>
            <DialogDescription>{failure?.error.message}</DialogDescription>
          </DialogHeader>
          {failure && failure.error.details.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {failure.error.details.map((issue) => (
                <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            {failure?.error.code === "PLAN_LIMIT_REACHED" ? (
              <Button asChild>
                <Link href="/dashboard/billing">View plans</Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setFailure(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
