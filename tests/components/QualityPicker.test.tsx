import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QualityPicker } from "../../src/components/QualityPicker";
import { KalturaFlavorAsset } from "../../src/types/kaltura";

function makeFlavor(overrides: Partial<KalturaFlavorAsset> = {}): KalturaFlavorAsset {
  return {
    id: "flv-1",
    entryId: "0_abc",
    partnerId: 123,
    status: 2,
    size: 50000,
    width: 1920,
    height: 1080,
    bitrate: 4000,
    frameRate: 29.97,
    fileExt: "mp4",
    isWeb: true,
    isOriginal: false,
    videoCodecId: "avc1",
    ...overrides,
  };
}

const hdFlavor = makeFlavor({ id: "flv-hd", width: 1280, height: 720, size: 25000 });
const sdFlavor = makeFlavor({ id: "flv-sd", width: 640, height: 480, size: 10000 });
const fullHdFlavor = makeFlavor({ id: "flv-fhd", width: 1920, height: 1080, size: 50000 });
const originalFlavor = makeFlavor({
  id: "flv-orig",
  width: 3840,
  height: 2160,
  size: 200000,
  isOriginal: true,
  isWeb: false,
});
const lowResFlavor = makeFlavor({
  id: "flv-low",
  width: 320,
  height: 240,
  size: 3000,
  isWeb: false,
});

describe("QualityPicker", () => {
  const defaultProps = {
    flavors: [hdFlavor, sdFlavor, fullHdFlavor, originalFlavor],
    selectedFlavorId: null,
    onSelect: jest.fn(),
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the Select Quality heading", () => {
    render(<QualityPicker {...defaultProps} />);
    expect(screen.getByText("Select Quality")).toBeTruthy();
  });

  it("renders all flavor options", () => {
    render(<QualityPicker {...defaultProps} />);
    expect(screen.getByText(/Full HD \(1080p\)/)).toBeTruthy();
    expect(screen.getByText(/^HD \(720p\)$/)).toBeTruthy();
    expect(screen.getByText(/^SD \(480p\)$/)).toBeTruthy();
    expect(screen.getByText("Original")).toBeTruthy();
  });

  it("labels flavors correctly by resolution threshold", () => {
    render(
      <QualityPicker
        {...defaultProps}
        flavors={[fullHdFlavor, hdFlavor, sdFlavor, lowResFlavor]}
      />,
    );
    expect(screen.getByText(/Full HD \(1080p\)/)).toBeTruthy();
    expect(screen.getByText(/^HD \(720p\)$/)).toBeTruthy();
    expect(screen.getByText(/^SD \(480p\)$/)).toBeTruthy();
    // Low res flavor label should be the raw resolution
    expect(screen.getByText("320×240")).toBeTruthy();
  });

  it("calls onSelect when a flavor is clicked", () => {
    const onSelect = jest.fn();
    render(<QualityPicker {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Original"));
    expect(onSelect).toHaveBeenCalledWith(originalFlavor);
  });

  it("renders all flavor rows when one is selected", () => {
    const { container } = render(<QualityPicker {...defaultProps} selectedFlavorId="flv-hd" />);
    // All flavor rows should render — 4 flavors in defaultProps
    const allFlavorDivs = container.querySelectorAll("[style*='cursor: pointer']");
    expect(allFlavorDivs.length).toBe(4);
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = jest.fn();
    render(<QualityPicker {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when Import is clicked", () => {
    const onConfirm = jest.fn();
    render(<QualityPicker {...defaultProps} selectedFlavorId="flv-hd" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Import"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables Import button when no flavor selected", () => {
    render(<QualityPicker {...defaultProps} selectedFlavorId={null} />);
    const importBtn = screen.getByText("Import").closest("sp-button");
    expect(importBtn?.getAttribute("disabled")).not.toBeNull();
  });

  it("shows Web badge for web-playable flavors", () => {
    render(<QualityPicker {...defaultProps} flavors={[hdFlavor]} />);
    expect(screen.getByText("Web")).toBeTruthy();
  });

  it("does not show Web badge for non-web flavors", () => {
    render(<QualityPicker {...defaultProps} flavors={[originalFlavor]} />);
    expect(screen.queryByText("Web")).toBeNull();
  });

  it("shows codec and bitrate details", () => {
    render(<QualityPicker {...defaultProps} flavors={[hdFlavor]} />);
    expect(screen.getByText(/MP4/)).toBeTruthy();
    expect(screen.getByText(/avc1/)).toBeTruthy();
    expect(screen.getByText(/4\.0 Mbps/)).toBeTruthy();
  });

  it("sorts flavors: web first by height desc, then original last", () => {
    const { container } = render(
      <QualityPicker
        {...defaultProps}
        flavors={[sdFlavor, originalFlavor, fullHdFlavor, hdFlavor]}
      />,
    );
    const labels = container.querySelectorAll("[style*='font-weight: 600']");
    const labelTexts = Array.from(labels).map((el) => el.textContent);
    // Web flavors sorted by height desc, then original at the end
    expect(labelTexts[0]).toMatch(/Full HD/);
    expect(labelTexts[1]).toMatch(/HD/);
    expect(labelTexts[2]).toMatch(/SD/);
    expect(labelTexts[3]).toBe("Original");
  });
});
