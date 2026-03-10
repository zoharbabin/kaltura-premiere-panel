import React, { useState, useEffect, useCallback } from "react";
import {
  KalturaCaptionAsset,
  KalturaCaptionType,
  KalturaVendorTaskStatus,
  KalturaEntryVendorTask,
} from "../types/kaltura";
import { CaptionService, ReachCatalogItem } from "../services/CaptionService";
import { LoadingSpinner, ErrorBanner, EmptyState, ProgressBar } from "../components";
import { getUserMessage } from "../utils/errors";
import { formatDate } from "../utils/format";

interface CaptionsPanelProps {
  captionService: CaptionService;
  entryId: string | null;
  entryName: string | null;
}

type CaptionView = "tracks" | "order" | "translate";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "it", name: "Italian" },
  { code: "ru", name: "Russian" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "pl", name: "Polish" },
];

export const CaptionsPanel: React.FC<CaptionsPanelProps> = ({
  captionService,
  entryId,
  entryName,
}) => {
  const [captions, setCaptions] = useState<KalturaCaptionAsset[]>([]);
  const [tasks, setTasks] = useState<KalturaEntryVendorTask[]>([]);
  const [catalogItems, setCatalogItems] = useState<ReachCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CaptionView>("tracks");
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<number | null>(null);
  const [targetLanguages, setTargetLanguages] = useState<Set<string>>(new Set());
  const [orderProgress, setOrderProgress] = useState<string | null>(null);

  // Load captions and tasks when entry changes
  useEffect(() => {
    if (!entryId) return;
    setIsLoading(true);
    setError(null);

    Promise.all([
      captionService.listCaptions(entryId).catch(() => []),
      captionService.listTasks(entryId).catch(() => []),
      captionService.listReachCatalogItems().catch(() => []),
    ])
      .then(([caps, tsks, items]) => {
        setCaptions(caps);
        setTasks(tsks);
        setCatalogItems(items);
      })
      .catch((err) => setError(getUserMessage(err)))
      .finally(() => setIsLoading(false));
  }, [entryId, captionService]);

  const handleOrderCaptioning = useCallback(async () => {
    if (!entryId || !selectedCatalogItem) return;
    setError(null);
    setOrderProgress("Ordering captioning...");

    try {
      const task = await captionService.triggerCaptioning(
        entryId,
        selectedCatalogItem,
        sourceLanguage,
      );
      setTasks((prev) => [...prev, task]);
      setOrderProgress(null);
      setView("tracks");
    } catch (err) {
      setError(getUserMessage(err));
      setOrderProgress(null);
    }
  }, [entryId, selectedCatalogItem, sourceLanguage, captionService]);

  const handleOrderTranslation = useCallback(async () => {
    if (!entryId || targetLanguages.size === 0) return;
    setError(null);
    setOrderProgress("Ordering translations...");

    try {
      const translationItems = catalogItems.filter((item) => item.serviceFeature === 2);
      const defaultItem = translationItems[0];
      if (!defaultItem) throw new Error("No translation catalog items available");

      const newTasks: KalturaEntryVendorTask[] = [];
      for (const lang of targetLanguages) {
        const task = await captionService.triggerTranslation(
          entryId,
          defaultItem.id,
          sourceLanguage,
          lang,
        );
        newTasks.push(task);
      }

      setTasks((prev) => [...prev, ...newTasks]);
      setTargetLanguages(new Set());
      setOrderProgress(null);
      setView("tracks");
    } catch (err) {
      setError(getUserMessage(err));
      setOrderProgress(null);
    }
  }, [entryId, targetLanguages, sourceLanguage, catalogItems, captionService]);

  const toggleTargetLanguage = useCallback((code: string) => {
    setTargetLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  if (!entryId) {
    return (
      <EmptyState
        title="No entry selected"
        description="Select a Kaltura entry from the Browse tab or publish a sequence to use captions."
      />
    );
  }

  if (isLoading) {
    return <LoadingSpinner label="Loading captions..." />;
  }

  return (
    <div className="panel-root panel-padding">
      {/* Entry header */}
      <div style={{ marginBottom: 8 }}>
        <sp-detail size="S" className="text-muted">
          {entryName || entryId}
        </sp-detail>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {orderProgress && <ProgressBar value={-1} label={orderProgress} />}

      {/* View tabs */}
      <div className="sub-tabs" style={{ margin: "0 -8px 8px", padding: "4px 8px" }}>
        <button
          className={`sub-tab${view === "tracks" ? " sub-tab--active" : ""}`}
          onClick={() => setView("tracks")}
        >
          Tracks ({captions.length})
        </button>
        <button
          className={`sub-tab${view === "order" ? " sub-tab--active" : ""}`}
          onClick={() => setView("order")}
        >
          Order Captions
        </button>
        {captions.length > 0 && (
          <button
            className={`sub-tab${view === "translate" ? " sub-tab--active" : ""}`}
            onClick={() => setView("translate")}
          >
            Translate
          </button>
        )}
      </div>

      <div style={{ flexGrow: 1, flexShrink: 1, flexBasis: "0%", overflowY: "auto" }}>
        {view === "tracks" && (
          <CaptionTrackList captions={captions} tasks={tasks} captionService={captionService} />
        )}
        {view === "order" && (
          <OrderCaptionsView
            catalogItems={catalogItems.filter((item) => item.serviceFeature === 1)}
            sourceLanguage={sourceLanguage}
            selectedCatalogItem={selectedCatalogItem}
            onSourceLanguageChange={setSourceLanguage}
            onCatalogItemChange={setSelectedCatalogItem}
            onOrder={handleOrderCaptioning}
          />
        )}
        {view === "translate" && (
          <TranslateView
            sourceLanguage={sourceLanguage}
            targetLanguages={targetLanguages}
            onSourceLanguageChange={setSourceLanguage}
            onToggleTarget={toggleTargetLanguage}
            onOrder={handleOrderTranslation}
            existingLanguages={new Set(captions.map((c) => c.language))}
          />
        )}
      </div>
    </div>
  );
};

// --- Sub-components ---

const CaptionTrackList: React.FC<{
  captions: KalturaCaptionAsset[];
  tasks: KalturaEntryVendorTask[];
  captionService: CaptionService;
}> = ({ captions, tasks, captionService }) => {
  if (captions.length === 0 && tasks.length === 0) {
    return (
      <EmptyState
        title="No captions yet"
        description='Use "Order Captions" to generate AI captions via Kaltura REACH.'
      />
    );
  }

  return (
    <div className="flex-col gap-8">
      {/* Active tasks */}
      {tasks
        .filter((t) => t.status !== KalturaVendorTaskStatus.READY)
        .map((task) => (
          <div key={task.id} className="card-item">
            <div className="card-item-header">
              <span>
                {task.targetLanguage
                  ? `Translation: ${task.sourceLanguage} \u2192 ${task.targetLanguage}`
                  : `Captioning: ${task.sourceLanguage}`}
              </span>
              <span
                className={task.status === KalturaVendorTaskStatus.ERROR ? "text-error" : undefined}
                style={
                  task.status !== KalturaVendorTaskStatus.ERROR ? { color: "#2680eb" } : undefined
                }
              >
                {captionService.getTaskStatusLabel(task.status)}
              </span>
            </div>
          </div>
        ))}

      {/* Caption tracks */}
      {captions.map((caption) => (
        <div key={caption.id} className="card-item">
          <div className="card-item-header">
            <div>
              <strong>
                {caption.language.toUpperCase()} — {caption.label}
              </strong>
              {caption.isDefault && (
                <span className="text-success" style={{ marginLeft: 4, fontSize: 10 }}>
                  Default
                </span>
              )}
            </div>
            <sp-action-button quiet size="s">
              Import
            </sp-action-button>
          </div>
          <div className="text-muted" style={{ marginTop: 2 }}>
            {formatCaptionFormat(caption.format)} {"\u00B7"} {formatDate(caption.createdAt)}
            {caption.accuracy && ` \u00B7 ${caption.accuracy}% accuracy`}
          </div>
        </div>
      ))}
    </div>
  );
};

const OrderCaptionsView: React.FC<{
  catalogItems: ReachCatalogItem[];
  sourceLanguage: string;
  selectedCatalogItem: number | null;
  onSourceLanguageChange: (lang: string) => void;
  onCatalogItemChange: (id: number | null) => void;
  onOrder: () => void;
}> = ({
  catalogItems,
  sourceLanguage,
  selectedCatalogItem,
  onSourceLanguageChange,
  onCatalogItemChange,
  onOrder,
}) => (
  <div className="flex-col gap-12">
    <div>
      <sp-detail size="S">Source Language</sp-detail>
      <select
        className="native-select"
        value={sourceLanguage}
        onChange={(e) => onSourceLanguageChange(e.target.value)}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
    </div>

    <div>
      <sp-detail size="S">Service Level</sp-detail>
      {catalogItems.length === 0 ? (
        <sp-body size="S" className="text-muted">
          No REACH captioning services available for this account.
        </sp-body>
      ) : (
        <div className="flex-col gap-4">
          {catalogItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onCatalogItemChange(item.id)}
              className={`catalog-card${selectedCatalogItem === item.id ? " catalog-card--selected" : ""}`}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>{item.name}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>
                {item.serviceType === 1 ? "Human" : "Machine"} {"\u00B7"} ~
                {formatTurnaround(item.turnAroundTime)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <sp-button
      variant="accent"
      onClick={onOrder}
      disabled={!selectedCatalogItem || undefined}
      style={{ width: "100%" }}
    >
      Order Captioning
    </sp-button>
  </div>
);

const TranslateView: React.FC<{
  sourceLanguage: string;
  targetLanguages: Set<string>;
  onSourceLanguageChange: (lang: string) => void;
  onToggleTarget: (code: string) => void;
  onOrder: () => void;
  existingLanguages: Set<string>;
}> = ({
  sourceLanguage,
  targetLanguages,
  onSourceLanguageChange,
  onToggleTarget,
  onOrder,
  existingLanguages,
}) => (
  <div className="flex-col gap-12">
    <div>
      <sp-detail size="S">Source Language</sp-detail>
      <select
        className="native-select"
        value={sourceLanguage}
        onChange={(e) => onSourceLanguageChange(e.target.value)}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
    </div>

    <div>
      <sp-detail size="S">Target Languages ({targetLanguages.size} selected)</sp-detail>
      <div className="flex-col gap-2" style={{ maxHeight: 300, overflowY: "auto" }}>
        {LANGUAGES.filter((l) => l.code !== sourceLanguage).map((lang) => (
          <div
            key={lang.code}
            onClick={() => onToggleTarget(lang.code)}
            className={`selectable-item${targetLanguages.has(lang.code) ? " selectable-item--selected" : ""}`}
          >
            <span style={{ width: 16, textAlign: "center" }}>
              {targetLanguages.has(lang.code) ? "\u2713" : ""}
            </span>
            <span>{lang.name}</span>
            {existingLanguages.has(lang.code) && (
              <span className="text-muted-light" style={{ fontSize: 10 }}>
                (exists)
              </span>
            )}
          </div>
        ))}
      </div>
    </div>

    <sp-button
      variant="accent"
      onClick={onOrder}
      disabled={targetLanguages.size === 0 || undefined}
      style={{ width: "100%" }}
    >
      Translate to {targetLanguages.size} Language{targetLanguages.size !== 1 ? "s" : ""}
    </sp-button>
  </div>
);

function formatCaptionFormat(format: KalturaCaptionType): string {
  switch (format) {
    case KalturaCaptionType.SRT:
      return "SRT";
    case KalturaCaptionType.DFXP:
      return "DFXP/TTML";
    case KalturaCaptionType.WEBVTT:
      return "WebVTT";
    case KalturaCaptionType.CAP:
      return "CAP";
    case KalturaCaptionType.SCC:
      return "SCC";
    default:
      return "Unknown";
  }
}

function formatTurnaround(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}
