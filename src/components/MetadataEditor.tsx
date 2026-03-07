import React, { useState, useCallback, useEffect, useRef } from "react";
import { KalturaMediaEntry } from "../types/kaltura";
import { MetadataService } from "../services/MetadataService";
import { useDebounce } from "../hooks/useDebounce";
import { SEARCH_DEBOUNCE_MS } from "../utils/constants";
import { ErrorBanner } from "./ErrorBanner";
import { getUserMessage } from "../utils/errors";

interface MetadataEditorProps {
  entry: KalturaMediaEntry;
  metadataService: MetadataService;
  onSave: (updated: KalturaMediaEntry) => void;
  onCancel: () => void;
}

export const MetadataEditor: React.FC<MetadataEditorProps> = ({
  entry,
  metadataService,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(entry.name);
  const [description, setDescription] = useState(entry.description || "");
  const [tags, setTags] = useState(entry.tags || "");
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const initialRef = useRef({
    name: entry.name,
    description: entry.description || "",
    tags: entry.tags || "",
  });

  const debouncedTagInput = useDebounce(tagInput, SEARCH_DEBOUNCE_MS);

  // Track changes
  useEffect(() => {
    const initial = initialRef.current;
    setHasChanges(
      name !== initial.name || description !== initial.description || tags !== initial.tags,
    );
  }, [name, description, tags]);

  // Tag autocomplete
  useEffect(() => {
    if (debouncedTagInput.length < 2) {
      setTagSuggestions([]);
      return;
    }
    metadataService
      .searchTags(debouncedTagInput)
      .then(setTagSuggestions)
      .catch(() => setTagSuggestions([]));
  }, [debouncedTagInput, metadataService]);

  const addTag = useCallback(
    (tag: string) => {
      const currentTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (!currentTags.includes(tag.trim())) {
        currentTags.push(tag.trim());
        setTags(currentTags.join(", "));
      }
      setTagInput("");
      setTagSuggestions([]);
    },
    [tags],
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      const currentTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t && t !== tagToRemove);
      setTags(currentTags.join(", "));
    },
    [tags],
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    setError(null);

    try {
      const updated = await metadataService.updateEntry(entry.id, {
        name: name.trim(),
        description: description.trim(),
        tags: tags.trim(),
      });
      onSave(updated);
    } catch (err) {
      setError(getUserMessage(err));
    } finally {
      setIsSaving(false);
    }
  }, [name, description, tags, entry.id, metadataService, onSave]);

  const handleCancel = useCallback(() => {
    if (hasChanges) {
      // Simple confirmation — in UXP this would use a dialog
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    onCancel();
  }, [hasChanges, onCancel]);

  const tagList = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <sp-detail size="M">Edit Metadata</sp-detail>
        {hasChanges && (
          <span style={{ fontSize: "10px", color: "var(--spectrum-global-color-orange-500)" }}>
            Unsaved changes
          </span>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Title */}
      <div>
        <sp-detail size="S">Title *</sp-detail>
        <sp-textfield
          placeholder="Video title"
          value={name}
          onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
          style={{ width: "100%" }}
        />
      </div>

      {/* Description */}
      <div>
        <sp-detail size="S">Description</sp-detail>
        <sp-textarea
          placeholder="Video description"
          value={description}
          onInput={(e: Event) => setDescription((e.target as HTMLTextAreaElement).value)}
          style={{ width: "100%" }}
        />
      </div>

      {/* Tags */}
      <div>
        <sp-detail size="S">Tags</sp-detail>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "4px" }}>
          {tagList.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                backgroundColor: "var(--spectrum-global-color-gray-200)",
                borderRadius: "12px",
                fontSize: "11px",
              }}
            >
              {tag}
              <span
                onClick={() => removeTag(tag)}
                style={{ cursor: "pointer", fontWeight: "bold", opacity: 0.6 }}
              >
                x
              </span>
            </span>
          ))}
        </div>
        <sp-textfield
          placeholder="Type to add tags..."
          value={tagInput}
          onInput={(e: Event) => setTagInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter" && tagInput.trim()) {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          style={{ width: "100%" }}
        />
        {tagSuggestions.length > 0 && (
          <div
            style={{
              border: "1px solid var(--spectrum-global-color-gray-300)",
              borderRadius: "4px",
              marginTop: "2px",
              maxHeight: "120px",
              overflowY: "auto",
            }}
          >
            {tagSuggestions.map((suggestion) => (
              <div
                key={suggestion}
                onClick={() => addTag(suggestion)}
                style={{
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "11px",
                }}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <sp-button variant="secondary" size="s" onClick={handleCancel}>
          Cancel
        </sp-button>
        <sp-button
          variant="accent"
          size="s"
          onClick={handleSave}
          disabled={!name.trim() || !hasChanges || isSaving || undefined}
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </sp-button>
      </div>
    </div>
  );
};
