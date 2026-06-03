import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WasteEntrySheet, WASTE_REASONS } from "../WasteEntrySheet";

describe("WasteEntrySheet", () => {
  const baseProps = {
    itemName: "Salmon Fillet",
    packSize: "1 pc",
    alreadyLoggedToday: 0,
    onLog: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders item name", () => {
    render(<WasteEntrySheet {...baseProps} />);
    expect(screen.getByText("Salmon Fillet")).toBeInTheDocument();
  });

  it("does not show already-logged line when alreadyLoggedToday is 0", () => {
    render(<WasteEntrySheet {...baseProps} alreadyLoggedToday={0} />);
    expect(screen.queryByText(/already logged today/i)).not.toBeInTheDocument();
  });

  it("shows already-logged qty when alreadyLoggedToday is greater than 0", () => {
    render(<WasteEntrySheet {...baseProps} alreadyLoggedToday={2} />);
    expect(screen.getByText(/already logged today/i)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it("renders all reason chips", () => {
    render(<WasteEntrySheet {...baseProps} />);
    for (const reason of WASTE_REASONS) {
      expect(screen.getByRole("button", { name: reason })).toBeInTheDocument();
    }
  });

  it("confirm button is disabled when qty is empty and no reason selected", () => {
    render(<WasteEntrySheet {...baseProps} />);
    expect(screen.getByRole("button", { name: /log waste/i })).toBeDisabled();
  });

  it("confirm button is disabled when qty is valid but no reason selected", () => {
    render(<WasteEntrySheet {...baseProps} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    expect(screen.getByRole("button", { name: /log waste/i })).toBeDisabled();
  });

  it("confirm button is disabled when reason is selected but qty is empty", () => {
    render(<WasteEntrySheet {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Spoilage" }));
    expect(screen.getByRole("button", { name: /log waste/i })).toBeDisabled();
  });

  it("confirm button is enabled when both qty and reason are selected", () => {
    render(<WasteEntrySheet {...baseProps} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Spoilage" }));
    expect(screen.getByRole("button", { name: /log waste/i })).not.toBeDisabled();
  });

  it("calls onLog with qty and reason on confirm", () => {
    const onLog = vi.fn();
    render(<WasteEntrySheet {...baseProps} onLog={onLog} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Spoilage" }));
    fireEvent.click(screen.getByRole("button", { name: /log waste/i }));
    expect(onLog).toHaveBeenCalledWith(2, "Spoilage");
  });

  it("calls onLog with the correct reason when Quality Issue - Commissary is selected", () => {
    const onLog = vi.fn();
    render(<WasteEntrySheet {...baseProps} onLog={onLog} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Quality Issue - Commissary" }));
    fireEvent.click(screen.getByRole("button", { name: /log waste/i }));
    expect(onLog).toHaveBeenCalledWith(1, "Quality Issue - Commissary");
  });

  it("calls onLog with Pull Out reason when Pull Out is selected", () => {
    const onLog = vi.fn();
    render(<WasteEntrySheet {...baseProps} onLog={onLog} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Pull Out" }));
    fireEvent.click(screen.getByRole("button", { name: /log waste/i }));
    expect(onLog).toHaveBeenCalledWith(3, "Pull Out");
  });

  it("selecting a new reason replaces the previous selection", () => {
    const onLog = vi.fn();
    render(<WasteEntrySheet {...baseProps} onLog={onLog} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Spoilage" }));
    fireEvent.click(screen.getByRole("button", { name: "Quality Check" }));
    fireEvent.click(screen.getByRole("button", { name: /log waste/i }));
    expect(onLog).toHaveBeenCalledWith(1, "Quality Check");
  });

  it("calls onClose when Cancel is tapped", () => {
    const onClose = vi.fn();
    render(<WasteEntrySheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is tapped", () => {
    const onClose = vi.fn();
    render(<WasteEntrySheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("waste-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
