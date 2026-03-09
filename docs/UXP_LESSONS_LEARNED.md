# UXP Plugin Development: Lessons Learned

Hard-won lessons from building a production UXP plugin for Premiere Pro. These cover UXP runtime limitations, Kaltura API specifics, and Premiere Pro API patterns that are not well-documented elsewhere.

---

## UXP Runtime Limitations

### No `TextEncoder` / `TextDecoder`

UXP's JavaScript engine does not include `TextEncoder` or `TextDecoder`. If you need to convert strings to byte arrays (e.g., for manual multipart body construction), use `charCodeAt`:

```typescript
const strToBytes = (s: string): Uint8Array => {
  const arr = new Uint8Array(s.length);
  for (let j = 0; j < s.length; j++) arr[j] = s.charCodeAt(j);
  return arr;
};
```

This works for ASCII strings (HTTP headers, multipart boundaries, form field names). For non-ASCII, you'd need a manual UTF-8 encoder.

### `FormData` + `Blob` Unreliable for Binary Uploads

UXP's `FormData.append(name, blob)` does not transmit binary data reliably. Kaltura returns `UPLOAD_ERROR` because the file data arrives empty. **Build multipart request bodies manually:**

```typescript
const boundary = `----Upload${Date.now()}`;
const parts: Uint8Array[] = [];

// Text fields
for (const [key, value] of Object.entries(fields)) {
  parts.push(
    strToBytes(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    ),
  );
}

// Binary file field
parts.push(
  strToBytes(
    `--${boundary}\r\nContent-Disposition: form-data; name="fileData"; filename="chunk.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  ),
);
parts.push(chunkBytes); // Uint8Array of actual file data
parts.push(strToBytes("\r\n"));
parts.push(strToBytes(`--${boundary}--\r\n`));

// Concatenate and send
const body = concatenateUint8Arrays(parts);
xhr.setRequestHeader("Content-Type", `multipart/form-data; boundary=${boundary}`);
xhr.send(body.buffer);
```

### `fs.readFile` Encoding Behavior

- `fs.readFile(path)` **without options** → returns `ArrayBuffer` (binary). This is what you want for media files.
- `fs.readFile(path, { encoding: "utf-8" })` → returns `string`.
- `fs.readFile(path, { encoding: "buffer" })` → **throws**: `"undefined encoding is not supported. Try utf-8, utf-16be or utf-16le"`.

### `XMLHttpRequest` for Upload Progress

`fetch()` does not support upload progress events. Use `XMLHttpRequest` with `xhr.upload.onprogress` for chunked upload progress tracking. UXP supports XHR.

### No CSS Grid, No `box-shadow`, No `@font-face`

UXP's rendering engine is not a full browser. Use Flexbox for all layouts. Use borders/background colors for visual depth. System fonts only.

### `sp-progress-bar` May Not Render

The Spectrum `<sp-progress-bar>` element sometimes fails to render in UXP. A native HTML progress bar built with `<div>` elements and inline styles is more reliable:

```tsx
<div style={{ width: "100%", height: "6px", backgroundColor: "#444", borderRadius: "3px" }}>
  <div
    style={{ width: `${pct}%`, height: "100%", backgroundColor: "#1473e6", borderRadius: "3px" }}
  />
</div>
```

---

## Spectrum Web Components (SWC) in UXP

### `AssertionError: false == true` in `preCreateCallback`

UXP's SWC implementation has an internal assertion in `preCreateCallback` that fires when Spectrum elements are rapidly destroyed and created in the same synchronous React render cycle. This typically happens during view transitions (e.g., switching tabs).

**Fix: Defer view switches by one frame:**

```typescript
// BAD — crashes UXP
setActiveTab("browse"); // destroys Panel A's SWC elements and creates Panel B's in same render

// GOOD — gives UXP time to clean up
setTimeout(() => setActiveTab("browse"), 0);
```

### Uncaught Exceptions Corrupt the Scripting Engine

If an uncaught JavaScript exception reaches UXP's scripting engine (e.g., an `AssertionError` from SWC), it corrupts the `dvascripting` thread state. Subsequent events dispatched to the plugin context (like `SequenceEvent.ClipSelectionChanged` when clicking the timeline) will crash Premiere Pro with a SIGSEGV.

**Fix: Always wrap the React app in an ErrorBoundary:**

```tsx
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
```

The ErrorBoundary catches errors before they reach UXP, logs them, and shows a recovery screen.

### Avoid Simultaneous State Updates During Navigation

Do not call both a parent callback (that changes the view) and a local state reset in the same click handler:

```typescript
// BAD — conflicting state updates crash SWC
onClick={() => { onPublished(entry); handleReset(); }}

// GOOD — separate concerns
<sp-button onClick={handleReset}>Publish Another</sp-button>
<sp-button onClick={() => onPublished(entry)}>Back to Browse</sp-button>
```

---

## Kaltura Upload API

### `resume` and `finalChunk` Values

Kaltura expects `"1"` / `"0"`, **not** `"true"` / `"false"`:

```typescript
// BAD
resume: String(isResume),       // → "true" or "false"
finalChunk: String(isFinal),    // → "true" or "false"

// GOOD
resume: isResume ? "1" : "0",
finalChunk: isFinal ? "1" : "0",
```

Reference: [zoharbabin/kaltura_uploader](https://github.com/zoharbabin/kaltura_uploader) (Python) and [kaltura/jQuery-File-Upload](https://github.com/kaltura/jQuery-File-Upload) (JavaScript).

### `uploadTokenId` and `ks` as URL Query Parameters

The Python Kaltura uploader sends `uploadTokenId` and `ks` as URL query parameters, not in the multipart body:

```typescript
const queryParams = new URLSearchParams({
  uploadTokenId: tokenId,
  format: "1",
});
if (ks) queryParams.set("ks", ks);
const url = `${serviceUrl}/api_v3/service/uploadToken/action/upload?${queryParams.toString()}`;
```

The multipart body should only contain: `resume`, `resumeAt`, `finalChunk`, and `fileData`.

### Upload Token Workflow

The correct order for creating an entry with content is:

1. `uploadToken.add` — create a token with file metadata (fileName, fileSize)
2. `uploadToken.upload` — upload file data in chunks to the token
3. `media.addFromUploadedFile` — create the entry and attach the uploaded content in one call

Do **not** create the entry first and then try to attach content — use `addFromUploadedFile` for new entries, or `media.updateContent` for replacing content on existing entries.

---

## Premiere Pro API (UXP)

### `EncoderManager.exportSequence()` — Runtime Constants Required

The export type parameter must be a runtime constant from the `premierepro` module, not a string:

```typescript
const pp = require("premierepro");

// BAD — accepted silently but produces no output file
await encoder.exportSequence(sequence, "IMMEDIATELY", outputPath, presetFile, true);

// GOOD — uses the actual runtime constant
await encoder.exportSequence(
  sequence,
  pp.Constants.ExportType.IMMEDIATELY,
  outputPath,
  presetFile,
  true, // exportFull
);
```

### Export Requires a Preset File

`exportSequence()` requires a `.epr` preset file. Search Premiere Pro's system preset directories:

- **macOS**: `/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/MediaIO/systempresets/`
- **Windows**: `C:\Program Files\Adobe\Adobe Premiere Pro 2026\MediaIO\systempresets\`

Look for H.264 "Match Source" presets. Accept any `.epr` as fallback.

### Export Completion Detection is Complex

Premiere Pro's `IMMEDIATELY` export mode creates the output file early (with container headers), then writes encoded data into it. The file may appear "stable" briefly during encoder initialization. Events (`EVENT_EXPORT_MEDIA_COMPLETE`, `EVENT_RENDER_COMPLETE`) may or may not fire.

**Recommended multi-layer approach:**

1. **Event listeners** (most reliable when they fire): `OperationCompleteEvent.EVENT_EXPORT_MEDIA_COMPLETE` on the project, and `EncoderManager.EVENT_RENDER_COMPLETE` / `EVENT_RENDER_ERROR` / `EVENT_RENDER_PROGRESS` on the encoder.
2. **Conservative file polling** (fallback): file must be >100 KB **and** stable (no size change) for 30 seconds.
3. **No absolute timeout** — large projects can take hours to export. Use idle-based detection only.

### `OperationCompleteEvent` State Values

The `state` property on `OperationCompleteEvent` uses numeric values:

- `0` = SUCCESS
- `1` = CANCELLED
- `2` = FAILED

### Importing Files into Premiere

Use UXP File Entry objects, not string paths:

```typescript
const uxpFs = require("uxp").storage.localFileSystem;
const fileEntry = await uxpFs.getEntryWithUrl("file:" + nativePath);
await project.importFiles([fileEntry], suppressUI, targetBin);
```

If bin import fails, retry with `null` as the target bin (imports to project root).

---

## General Patterns

### Fire-and-Forget API Calls

Some API calls (like audit logging) are not worth awaiting or error-handling in the UI flow. Use fire-and-forget:

```typescript
logAction(action: string, entryId?: string, details?: string): void {
  this.client.request({ service: "...", action: "...", params: { ... } }).catch(() => {});
}
```

### Duck-Typed Service Interfaces

Panels define their own minimal interfaces for the services they consume, rather than importing concrete service classes. This enables:

- Loose coupling between panels and services
- Easy mocking in tests
- Clear documentation of what each panel actually needs

```typescript
// In the panel file
interface HostServiceLike {
  isAvailable(): boolean;
  getActiveSequence(): Promise<{ name: string } | null>;
  exportActiveSequence?(onProgress?: (percent: number) => void): Promise<FileInfo>;
}
```

### Reading Crash Dumps

Premiere Pro crash dumps are stored in:

- **macOS**: `~/Library/Caches/Adobe/Premiere Pro/{version}/SentryIO-db/`
- Dumps move from `pending/` to `completed/` after being sent to Adobe

Key files per crash:

- `{uuid}.dmp` — Minidump (binary, use `strings` to extract readable data)
- `attachments/{uuid}/__sentry-event` — crash metadata (msgpack format, readable with `strings`)
- `attachments/{uuid}/__sentry-breadcrumb1` — event timeline leading to the crash

Look for `ScriptContext`, `EventType`, and `pluginid` fields to identify plugin-related crashes.
