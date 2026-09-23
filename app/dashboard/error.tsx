"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/dashboard/ErrorState";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Detailed error stays server-side/in the console — never rendered to the merchant.
    console.error("Dashboard error boundary:", error);
  }, [error]);

  return (
    <div className="py-10">
      <ErrorState
        title="This page couldn't load"
        message="Something went wrong loading your dashboard. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
