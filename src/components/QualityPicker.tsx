import React, { useCallback } from "react";
import { KalturaFlavorAsset } from "../types/kaltura";
import { formatFileSize, formatBitrate, formatResolution } from "../utils/format";
import { RESOLUTION_FULL_HD, RESOLUTION_HD, RESOLUTION_SD } from "../utils/constants";
import { useTranslation } from "../i18n";

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

function getFlavorLabel(
  flavor: KalturaFlavorAsset,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (flavor.isOriginal) return t("quality.original");
  const res = formatResolution(flavor.width, flavor.height);
  if (flavor.height >= RESOLUTION_FULL_HD) return t("quality.fullHD", { res });
  if (flavor.height >= RESOLUTION_HD) return t("quality.hd", { res });
  if (flavor.height >= RESOLUTION_SD) return t("quality.sd", { res });
  return res || "Unknown";
}

export const QualityPicker: React.FC<QualityPickerProps> = ({
  flavors,
  selectedFlavorId,
  onSelect,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
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
        padding: "12px",
        backgroundColor: "#323232",
        borderRadius: "4px",
      }}
    >
      <sp-detail size="M" style={{ marginBottom: 8 }}>
        {t("quality.selectQuality")}
      </sp-detail>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {sorted.map((flavor) => (
          <div
            key={flavor.id}
            onClick={() => handleSelect(flavor)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px",
              borderRadius: "4px",
              cursor: "pointer",
              marginBottom: "4px",
              border: selectedFlavorId === flavor.id ? "2px solid #2680eb" : "1px solid #4a4a4a",
              backgroundColor: selectedFlavorId === flavor.id ? "#1a3a5c" : "transparent",
            }}
          >
            <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%" }}>
              <div style={{ fontSize: "12px", fontWeight: 600 }}>{getFlavorLabel(flavor, t)}</div>
              <div
                style={{
                  fontSize: "10px",
                  color: "#8b8b8b",
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
              <span style={{ fontSize: "10px", color: "#2d9d78", marginLeft: 8 }}>
                {t("quality.web")}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
        <sp-button variant="secondary" size="s" onClick={onCancel} style={{ marginRight: 8 }}>
          {t("quality.cancel")}
        </sp-button>
        <sp-button
          variant="accent"
          size="s"
          onClick={onConfirm}
          disabled={!selectedFlavorId || undefined}
        >
          {t("quality.import")}
        </sp-button>
      </div>
    </div>
  );
};
