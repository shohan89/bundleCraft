import { render, screen } from "@testing-library/react";
import { DollarSign } from "lucide-react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("renders the provided value", () => {
    render(<MetricCard label="Revenue" value="$100.00" icon={DollarSign} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });

  it("renders a 'No data yet' state instead of fabricating a value when value is null", () => {
    render(<MetricCard label="Revenue" value={null} icon={DollarSign} />);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });
});
