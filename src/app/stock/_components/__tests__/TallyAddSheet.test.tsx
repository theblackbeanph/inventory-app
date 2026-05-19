import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TallyAddSheet } from "../TallyAddSheet";

describe("TallyAddSheet", () => {
  const baseProps = {
    itemName: "Jasmine Rice",
    packSize: "25 kg / bag",
    currentCount: 10,
    onAdd: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders item name", () => {
    render(<TallyAddSheet {...baseProps} />);
    expect(screen.getByText("Jasmine Rice")).toBeInTheDocument();
  });

  it("confirm button is disabled when input is empty", () => {
    render(<TallyAddSheet {...baseProps} />);
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
  });

  it("confirm button is disabled when input is 0", () => {
    render(<TallyAddSheet {...baseProps} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
  });

  it("shows updated running total as user types", () => {
    render(<TallyAddSheet {...baseProps} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "6" } });
    expect(screen.getByText(/10 → 16/)).toBeInTheDocument();
  });

  it("calls onAdd with parsed qty on confirm", () => {
    const onAdd = vi.fn();
    render(<TallyAddSheet {...baseProps} onAdd={onAdd} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onAdd).toHaveBeenCalledWith(6);
  });

  it("calls onClose when Cancel is tapped", () => {
    const onClose = vi.fn();
    render(<TallyAddSheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is tapped", () => {
    const onClose = vi.fn();
    render(<TallyAddSheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("tally-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
