import React, { useCallback } from "react";
import { KalturaFlavorAsset } from "../types/kaltura";
import { formatFileSize, formatBitrate, formatResolution } from "../utils/format";
import { RESOLUTION_FULL_HD, RESOLUTION_HD, RESOLUTION_SD } from "../utils/constants";

interface QualityPickerProps {
  flavors: KalturaFlavorAsset[];
  selectedFlavorId: string | null;
  onSelect: (flavor: KalturaFlavorAsset) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Sort flavors: web playable first, then by height descending */
function sortFlavors(flavors: KalturaFlavorAsset[]): KalturaFlavorAsset[] {
  return [...flavors].sort((a, b) => {
    if (a.isOriginal !== b.isOriginal) return a.isOriginal ? 1 : -1;
    if (a.isWeb !== b.isWeb) return a.isWeb ? -1 : 1;
    return (b.height || 0) - (a.height || 0);
  });
}

function getFlavorLabel(flavor: KalturaFlavorAsset): string {
  if (flavor.isOriginal) return "Original";
  const res = formatResolution(flavor.width, flavor.height);
  if (flavor.height >= RESOLUTION_FULL_HD) return `Full HD (${res})`;
  if (flavor.height >= RESOLUTION_HD) return `HD (${res})`;
  if (flavor.height >= RESOLUTION_SD) return `SD (${res})`;
  return res || "Unknown";
}

export const QualityPicker: React.FC<QualityPickerProps> = ({
  flavors,
  selectedFlavorId,
  onSelect,
  onCancel,
  onConfirm,
}) => {
  const sorted = sortFlavors(flavors);

  const handleSelect = useCallback(
    (flavor: KalturaFlavorAsset) => {
      onSelect(flavor);
    },
    [onSelect],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "12px",
        backgroundColor: "var(--spectrum-global-color-gray-100)",
        borderRadius: "4px",
      }}
    >
      <sp-detail size="M">Select Quality</sp-detail>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {sorted.map((flavor) => (
          <div
            key={flavor.id}
            onClick={() => handleSelect(flavor)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px",
              borderRadius: "4px",
              cursor: "pointer",
              border:
                selectedFlavorId === flavor.id
                  ? "2px solid var(--spectrum-global-color-blue-500)"
                  : "1px solid var(--spectrum-global-color-gray-300)",
              backgroundColor:
                selectedFlavorId === flavor.id
                  ? "var(--spectrum-global-color-blue-100)"
                  : "transparent",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "12px", fontWeight: 600 }}>{getFlavorLabel(flavor)}</div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--spectrum-global-color-gray-600)",
                  marginTop: "2px",
                }}
              >
                {[
                  flavor.fileExt?.toUpperCase(),
                  flavor.videoCodecId,
                  flavor.bitrate ? formatBitrate(flavor.bitrate) : null,
                  flavor.size ? formatFileSize(flavor.size * 1024) : null,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </div>
            </div>
            {flavor.isWeb && (
              <span style={{ fontSize: "10px", color: "var(--spectrum-global-color-green-600)" }}>
                Web
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
        <sp-button variant="secondary" size="s" onClick={onCancel}>
          Cancel
        </sp-button>
        <sp-button
          variant="accent"
          size="s"
          onClick={onConfirm}
          disabled={!selectedFlavorId || undefined}
        >
          Import
        </sp-button>
      </div>
    </div>
  );
};
