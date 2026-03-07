import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MetadataEditor } from "../../src/components/MetadataEditor";
import { KalturaMediaEntry, KalturaEntryStatus, KalturaMediaType } from "../../src/types/kaltura";

function makeEntry(overrides: Partial<KalturaMediaEntry> = {}): KalturaMediaEntry {
  return {
    id: "0_test",
    name: "Test Video",
    description: "A test description",
    tags: "tag1, tag2",
    partnerId: 123,
    status: KalturaEntryStatus.READY,
    mediaType: KalturaMediaType.VIDEO,
    duration: 120,
    createdAt: 1700000000,
    updatedAt: 1700000000,
    ...overrides,
  };
}

function mockMetadataService(overrides: Record<string, unknown> = {}) {
  return {
    updateEntry: jest.fn().mockImplementation((_id: string, data: Partial<KalturaMediaEntry>) =>
      Promise.resolve({
        ...makeEntry(),
        ...data,
      }),
    ),
    searchTags: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

/** Simulate input on a custom element (sp-textfield) which doesn't have a native value setter.
 * Sets the value property on the element so event.target.value works in React handlers. */
function simulateInput(element: Element, value: string) {
  // Set value on the element so handler reading (e.target as HTMLInputElement).value sees it
  (element as unknown as { value: string }).value = value;
  const event = new Event("input", { bubbles: true });
  element.dispatchEvent(event);
}

describe("MetadataEditor", () => {
  const defaultProps = {
    entry: makeEntry(),
    metadataService: mockMetadataService() as never,
    onSave: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn().mockReturnValue(true);
  });

  it("renders the Edit Metadata heading", () => {
    render(<MetadataEditor {...defaultProps} />);
    expect(screen.getByText("Edit Metadata")).toBeTruthy();
  });

  it("shows the entry name in the title field", () => {
    const { container } = render(<MetadataEditor {...defaultProps} />);
    const titleField = container.querySelector('sp-textfield[placeholder="Video title"]');
    expect(titleField?.getAttribute("value")).toBe("Test Video");
  });

  it("shows the description field", () => {
    const { container } = render(<MetadataEditor {...defaultProps} />);
    const descField = container.querySelector('sp-textarea[placeholder="Video description"]');
    expect(descField?.getAttribute("value")).toBe("A test description");
  });

  it("renders existing tags as pills", () => {
    render(<MetadataEditor {...defaultProps} />);
    expect(screen.getByText("tag1")).toBeTruthy();
    expect(screen.getByText("tag2")).toBeTruthy();
  });

  it("shows Save Changes and Cancel buttons", () => {
    render(<MetadataEditor {...defaultProps} />);
    expect(screen.getByText("Save Changes")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("disables Save when no changes made", () => {
    render(<MetadataEditor {...defaultProps} />);
    const saveBtn = screen.getByText("Save Changes").closest("sp-button");
    expect(saveBtn?.getAttribute("disabled")).not.toBeNull();
  });

  it("enables Save after a field changes", () => {
    const { container } = render(<MetadataEditor {...defaultProps} />);
    const titleField = container.querySelector('sp-textfield[placeholder="Video title"]')!;
    act(() => {
      simulateInput(titleField, "New Title");
    });

    const saveBtn = screen.getByText("Save Changes").closest("sp-button");
    expect(saveBtn?.getAttribute("disabled")).toBeNull();
  });

  it("shows 'Unsaved changes' indicator when modified", () => {
    const { container } = render(<MetadataEditor {...defaultProps} />);
    const titleField = container.querySelector('sp-textfield[placeholder="Video title"]')!;
    act(() => {
      simulateInput(titleField, "Modified");
    });
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("calls metadataService.updateEntry and onSave on save", async () => {
    const service = mockMetadataService();
    const onSave = jest.fn();
    const { container } = render(
      <MetadataEditor {...defaultProps} metadataService={service as never} onSave={onSave} />,
    );

    const titleField = container.querySelector('sp-textfield[placeholder="Video title"]')!;
    act(() => {
      simulateInput(titleField, "Updated Title");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save Changes"));
    });

    await waitFor(() => {
      expect(service.updateEntry).toHaveBeenCalledWith("0_test", {
        name: "Updated Title",
        description: "A test description",
        tags: "tag1, tag2",
      });
    });
    expect(onSave).toHaveBeenCalled();
  });

  it("shows error banner when save fails", async () => {
    const service = mockMetadataService({
      updateEntry: jest.fn().mockRejectedValue(new Error("API down")),
    });
    const { container } = render(
      <MetadataEditor {...defaultProps} metadataService={service as never} />,
    );

    const titleField = container.querySelector('sp-textfield[placeholder="Video title"]')!;
    act(() => {
      simulateInput(titleField, "Fail");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save Changes"));
    });

    await waitFor(() => {
      expect(screen.getByText("API down")).toBeTruthy();
    });
  });

  it("shows 'Saving...' while save is in progress", async () => {
    let resolveUpdate!: (val: KalturaMediaEntry) => void;
    const service = mockMetadataService({
      updateEntry: jest.fn().mockImplementation(
        () =>
          new Promise<KalturaMediaEntry>((r) => {
            resolveUpdate = r;
          }),
      ),
    });
    const { container } = render(
      <MetadataEditor {...defaultProps} metadataService={service as never} />,
    );

    const titleField = container.querySelector('sp-textfield[placeholder="Video title"]')!;
    act(() => {
      simulateInput(titleField, "New");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save Changes"));
    });

    expect(screen.getByText("Saving...")).toBeTruthy();

    await act(async () => {
      resolveUpdate(makeEntry({ name: "New" }));
    });
  });

  it("does not save when title is empty", async () => {
    const service = mockMetadataService();
    const { container } = render(
      <MetadataEditor {...defaultProps} metadataService={service as never} />,
    );

    const titleField = container.querySelector('sp-textfield[placeholder="Video title"]')!;
    act(() => {
      simulateInput(titleField, "");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save Changes"));
    });

    expect(service.updateEntry).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel is clicked with no changes", () => {
    const onCancel = jest.fn();
    render(<MetadataEditor {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows confirm dialog when cancelling with unsaved changes", () => {
    window.confirm = jest.fn().mockReturnValue(false);
    const onCancel = jest.fn();
    const { container } = render(<MetadataEditor {...defaultProps} onCancel={onCancel} />);

    const titleField = container.querySelector('sp-textfield[placeholder="Video title"]')!;
    act(() => {
      simulateInput(titleField, "Changed");
    });

    fireEvent.click(screen.getByText("Cancel"));
    expect(window.confirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("removes a tag when the x is clicked", () => {
    render(<MetadataEditor {...defaultProps} />);
    const removeButtons = screen.getAllByText("x");
    expect(removeButtons.length).toBe(2);

    fireEvent.click(removeButtons[0]); // Remove tag1
    expect(screen.queryByText("tag1")).toBeNull();
    expect(screen.getByText("tag2")).toBeTruthy();
  });

  it("renders with empty tags and description", () => {
    const entry = makeEntry({ tags: "", description: "" });
    render(<MetadataEditor {...defaultProps} entry={entry} />);
    expect(screen.getByText("Edit Metadata")).toBeTruthy();
    expect(screen.queryByText("x")).toBeNull();
  });

  it("shows tag suggestions when search returns results", async () => {
    jest.useFakeTimers();
    const service = mockMetadataService({
      searchTags: jest.fn().mockResolvedValue(["suggested-tag", "another-tag"]),
    });
    const { container } = render(
      <MetadataEditor {...defaultProps} metadataService={service as never} />,
    );

    const tagInput = container.querySelector('sp-textfield[placeholder="Type to add tags..."]')!;
    simulateInput(tagInput, "sug");

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText("suggested-tag")).toBeTruthy();
      expect(screen.getByText("another-tag")).toBeTruthy();
    });

    jest.useRealTimers();
  });

  it("adds a suggestion when clicked", async () => {
    jest.useFakeTimers();
    const service = mockMetadataService({
      searchTags: jest.fn().mockResolvedValue(["new-tag"]),
    });
    const { container } = render(
      <MetadataEditor {...defaultProps} metadataService={service as never} />,
    );

    const tagInput = container.querySelector('sp-textfield[placeholder="Type to add tags..."]')!;
    simulateInput(tagInput, "ne");

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText("new-tag")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("new-tag"));
    // new-tag should now appear as a pill (with an x button)
    const removeButtons = screen.getAllByText("x");
    expect(removeButtons.length).toBe(3); // tag1, tag2, new-tag

    jest.useRealTimers();
  });
});
