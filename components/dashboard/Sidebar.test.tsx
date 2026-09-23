import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavLinks } from "./Sidebar";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("NavLinks", () => {
  it("renders all five dashboard navigation items", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bundles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Bundle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("marks Home as the current page when on /dashboard", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Bundles" })).not.toHaveAttribute("aria-current");
  });

  it("marks Bundles as current on /dashboard/bundles, not Create Bundle", () => {
    mockUsePathname.mockReturnValue("/dashboard/bundles");
    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Bundles" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Create Bundle" })).not.toHaveAttribute("aria-current");
  });

  it("marks Create Bundle as current on /dashboard/bundles/create, not Bundles", () => {
    mockUsePathname.mockReturnValue("/dashboard/bundles/create");
    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Create Bundle" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Bundles" })).not.toHaveAttribute("aria-current");
  });

  it("calls onNavigate when a link is clicked (mobile drawer close behavior)", async () => {
    mockUsePathname.mockReturnValue("/dashboard");
    const onNavigate = vi.fn();
    render(<NavLinks onNavigate={onNavigate} />);

    screen.getByRole("link", { name: "Bundles" }).click();
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
