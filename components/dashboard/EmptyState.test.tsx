import { render, screen } from "@testing-library/react";
import { Package } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title, description, and optional action", () => {
    render(
      <EmptyState
        icon={Package}
        title="No bundles yet"
        description="Create your first bundle."
        action={<button type="button">Create bundle</button>}
      />,
    );

    expect(screen.getByText("No bundles yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first bundle.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create bundle" })).toBeInTheDocument();
  });

  it("renders without an action", () => {
    render(<EmptyState icon={Package} title="Empty" description="Nothing here." />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
