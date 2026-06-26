import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WasteContent } from "../WasteContent";
import type { StockAdjustment } from "@/lib/types";

const mockItems = [
  { name: "Salmon Fillet", packSize: "1 pc", category: "portion" as const, unit: "pc" as const, reorderAt: 5, department: "kitchen" as const, location: "back_kitchen" },
  { name: "Beef Tapa", packSize: "1 pc", category: "portion" as const, unit: "pc" as const, reorderAt: 5, department: "kitchen" as const, location: "back_kitchen" },
  { name: "Smoked Salmon", packSize: "1 pc", category: "portion" as const, unit: "pc" as const, reorderAt: 5, department: "kitchen" as const, location: "back_kitchen" },
];

const baseProps = {
  items: mockItems,
  todayWaste: [] as StockAdjustment[],
  wasteHistory: [] as StockAdjustment[],
  onSubmit: vi.fn(),
  onExport: vi.fn(),
  today: "2026-06-04",
  loading: false,
};

// ── Sub-tab navigation ────────────────────────────────────────────────────────

describe("WasteContent sub-tabs", () => {
  it("shows Log Waste sub-tab active by default", () => {
    render(<WasteContent {...baseProps} />);
    expect(screen.getByRole("tab", { name: /log waste/i })).toHaveAttribute("aria-selected", "true");
  });

  it("switches to History sub-tab on click", () => {
    render(<WasteContent {...baseProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /history/i }));
    expect(screen.getByRole("tab", { name: /history/i })).toHaveAttribute("aria-selected", "true");
  });
});

// ── Item selection (Step 1) ───────────────────────────────────────────────────

describe("WasteContent item selection", () => {
  it("renders all items in the list", () => {
    render(<WasteContent {...baseProps} />);
    expect(screen.getByText("Salmon Fillet")).toBeInTheDocument();
    expect(screen.getByText("Beef Tapa")).toBeInTheDocument();
    expect(screen.getByText("Smoked Salmon")).toBeInTheDocument();
  });

  it("search filters items by name", () => {
    render(<WasteContent {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText(/search items/i), { target: { value: "salmon" } });
    expect(screen.getByText("Salmon Fillet")).toBeInTheDocument();
    expect(screen.getByText("Smoked Salmon")).toBeInTheDocument();
    expect(screen.queryByText("Beef Tapa")).not.toBeInTheDocument();
  });

  it("tapping an item checks it and shows qty stepper starting at 1", () => {
    render(<WasteContent {...baseProps} />);
    fireEvent.click(screen.getByTestId("item-row-Salmon Fillet"));
    expect(screen.getByTestId("qty-Salmon Fillet")).toHaveTextContent("1");
  });

  it("tapping a checked item unchecks it and hides stepper", () => {
    render(<WasteContent {...baseProps} />);
    fireEvent.click(screen.getByTestId("item-row-Salmon Fillet"));
    fireEvent.click(screen.getByTestId("item-row-Salmon Fillet"));
    expect(screen.queryByTestId("qty-Salmon Fillet")).not.toBeInTheDocument();
  });

  it("stepper + increments qty", () => {
    render(<WasteContent {...baseProps} />);
    fireEvent.click(screen.getByTestId("item-row-Salmon Fillet"));
    fireEvent.click(screen.getByTestId("inc-Salmon Fillet"));
    expect(screen.getByTestId("qty-Salmon Fillet")).toHaveTextContent("2");
  });

  it("stepper - decrements qty but not below 1", () => {
    render(<WasteContent {...baseProps} />);
    fireEvent.click(screen.getByTestId("item-row-Salmon Fillet"));
    fireEvent.click(screen.getByTestId("dec-Salmon Fillet"));
    expect(screen.getByTestId("qty-Salmon Fillet")).toHaveTextContent("1");
  });

  it("Review button is disabled when no items are selected", () => {
    render(<WasteContent {...baseProps} />);
    expect(screen.getByRole("button", { name: /review waste/i })).toBeDisabled();
  });

  it("Review button shows selected item count", () => {
    render(<WasteContent {...baseProps} />);
    fireEvent.click(screen.getByTestId("item-row-Salmon Fillet"));
    fireEvent.click(screen.getByTestId("item-row-Beef Tapa"));
    expect(screen.getByRole("button", { name: /review waste · 2 items/i })).toBeInTheDocument();
  });

  it("shows already-logged-today badge when item has waste today", () => {
    const todayWaste: StockAdjustment[] = [
      { id: 1, branch: "MKT", department: "kitchen", date: "2026-06-04", item: "Salmon Fillet", type: "waste", qty: 3, loggedBy: "Maria" },
    ];
    render(<WasteContent {...baseProps} todayWaste={todayWaste} />);
    expect(screen.getByTestId("logged-today-Salmon Fillet")).toHaveTextContent("3");
  });
});

// ── Review screen (Step 2) ────────────────────────────────────────────────────

describe("WasteContent review screen", () => {
  function goToReview() {
    render(<WasteContent {...baseProps} />);
    fireEvent.click(screen.getByTestId("item-row-Salmon Fillet"));
    fireEvent.click(screen.getByTestId("inc-Salmon Fillet"));
    fireEvent.click(screen.getByTestId("item-row-Beef Tapa"));
    fireEvent.click(screen.getByRole("button", { name: /review waste/i }));
  }

  it("shows item names and qtys on review screen", () => {
    goToReview();
    expect(screen.getByText("Salmon Fillet")).toBeInTheDocument();
    expect(screen.getByText("Beef Tapa")).toBeInTheDocument();
    expect(screen.getByTestId("review-qty-Salmon Fillet")).toHaveTextContent("2");
    expect(screen.getByTestId("review-qty-Beef Tapa")).toHaveTextContent("1");
  });

  it("back button returns to selection screen", () => {
    goToReview();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument();
  });

  it("Submit button is disabled until all items have reasons", () => {
    goToReview();
    expect(screen.getByRole("button", { name: /submit waste/i })).toBeDisabled();
  });

  it("Submit button is disabled when only some items have reasons", () => {
    goToReview();
    fireEvent.click(screen.getByTestId("reason-Salmon Fillet-Spoilage"));
    expect(screen.getByRole("button", { name: /submit waste/i })).toBeDisabled();
  });

  it("Submit button is enabled when all items have reasons", () => {
    goToReview();
    fireEvent.click(screen.getByTestId("reason-Salmon Fillet-Spoilage"));
    fireEvent.click(screen.getByTestId("reason-Beef Tapa-Quality Issue - Kitchen"));
    expect(screen.getByRole("button", { name: /submit waste/i })).not.toBeDisabled();
  });

  it("calls onSubmit with correct item, qty and reason data", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<WasteContent {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId("item-row-Salmon Fillet"));
    fireEvent.click(screen.getByTestId("inc-Salmon Fillet"));
    fireEvent.click(screen.getByRole("button", { name: /review waste/i }));
    fireEvent.click(screen.getByTestId("reason-Salmon Fillet-Spoilage"));
    fireEvent.click(screen.getByRole("button", { name: /submit waste/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith([{ item: "Salmon Fillet", qty: 2, reason: "Spoilage" }]);
    });
  });
});

// ── History tab ───────────────────────────────────────────────────────────────

describe("WasteContent history tab", () => {
  function goToHistory(wasteHistory: StockAdjustment[] = []) {
    render(<WasteContent {...baseProps} wasteHistory={wasteHistory} />);
    fireEvent.click(screen.getByRole("tab", { name: /history/i }));
  }

  it("shows empty state when no waste has been logged", () => {
    goToHistory();
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it("shows waste entries grouped by date", () => {
    const history: StockAdjustment[] = [
      { id: 1, branch: "MKT", department: "kitchen", date: "2026-06-03", item: "Salmon Fillet", type: "waste", qty: 2, loggedBy: "Maria", note: "Spoilage" },
      { id: 2, branch: "MKT", department: "kitchen", date: "2026-06-03", item: "Beef Tapa", type: "waste", qty: 1, loggedBy: "Maria", note: "Quality Issue - Kitchen" },
      { id: 3, branch: "MKT", department: "kitchen", date: "2026-06-01", item: "Smoked Salmon", type: "waste", qty: 4, loggedBy: "Juan", note: "Pull Out" },
    ];
    goToHistory(history);
    expect(screen.getByTestId("history-group-2026-06-03")).toBeInTheDocument();
    expect(screen.getByTestId("history-group-2026-06-01")).toBeInTheDocument();
  });

  it("shows correct item count per date group", () => {
    const history: StockAdjustment[] = [
      { id: 1, branch: "MKT", department: "kitchen", date: "2026-06-03", item: "Salmon Fillet", type: "waste", qty: 2, loggedBy: "Maria", note: "Spoilage" },
      { id: 2, branch: "MKT", department: "kitchen", date: "2026-06-03", item: "Beef Tapa", type: "waste", qty: 1, loggedBy: "Maria", note: "Spoilage" },
    ];
    goToHistory(history);
    expect(screen.getByTestId("history-group-2026-06-03")).toHaveTextContent("2 items");
  });

  it("shows Log Waste button on history tab", () => {
    goToHistory();
    expect(screen.getByRole("button", { name: /\+ log waste/i })).toBeInTheDocument();
  });

  it("Log Waste button on history tab switches to Log Waste sub-tab", () => {
    goToHistory();
    fireEvent.click(screen.getByRole("button", { name: /\+ log waste/i }));
    expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument();
  });
});
