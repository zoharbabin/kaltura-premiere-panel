import "@testing-library/jest-dom";

// Mock UXP modules that aren't available outside Premiere Pro
jest.mock(
  "uxp",
  () => ({
    entrypoints: {
      setup: jest.fn(),
    },
    storage: {
      formats: {
        binary: "binary",
        utf8: "utf8",
      },
      secureStorage: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
        removeItem: jest.fn().mockResolvedValue(undefined),
      },
      localFileSystem: {
        getDataFolder: jest.fn().mockResolvedValue({
          nativePath: "/tmp/kaltura-data",
          createFile: jest.fn().mockImplementation((fileName: string) => {
            let storedData: ArrayBuffer | null = null;
            return Promise.resolve({
              write: jest.fn().mockImplementation((data: unknown) => {
                if (data instanceof ArrayBuffer) storedData = data;
                else if (data instanceof Uint8Array)
                  storedData = (data.buffer as ArrayBuffer).slice(
                    data.byteOffset,
                    data.byteOffset + data.byteLength,
                  );
                return Promise.resolve(undefined);
              }),
              read: jest
                .fn()
                .mockImplementation(() => Promise.resolve(storedData ?? new ArrayBuffer(0))),
              nativePath: `/tmp/kaltura-data/${fileName}`,
            });
          }),
        }),
        getTemporaryFolder: jest.fn().mockResolvedValue({
          nativePath: "/tmp/kaltura-download",
          createFile: jest.fn().mockImplementation((fileName: string) => {
            let storedData: ArrayBuffer | null = null;
            return Promise.resolve({
              write: jest.fn().mockImplementation((data: unknown) => {
                if (data instanceof ArrayBuffer) storedData = data;
                else if (data instanceof Uint8Array)
                  storedData = (data.buffer as ArrayBuffer).slice(
                    data.byteOffset,
                    data.byteOffset + data.byteLength,
                  );
                return Promise.resolve(undefined);
              }),
              read: jest
                .fn()
                .mockImplementation(() => Promise.resolve(storedData ?? new ArrayBuffer(0))),
              nativePath: `/tmp/kaltura-download/${fileName}`,
            });
          }),
        }),
        getEntryWithUrl: jest.fn().mockImplementation((url: string) => {
          // Extract filename from plugin-data:/filename
          const fileName = url.replace("plugin-data:/", "");
          return Promise.resolve({
            nativePath: `/tmp/kaltura-data/${fileName}`,
            isFile: true,
          });
        }),
      },
    },
  }),
  { virtual: true },
);

// Mock UXP fs module (NOT Node.js fs — UXP's own path-based file API)
jest.mock(
  "fs",
  () => ({
    writeFile: jest.fn().mockResolvedValue(0),
    readFile: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    lstat: jest.fn().mockResolvedValue({
      isFile: () => true,
      size: 1024,
    }),
    readFileSync: jest.fn().mockReturnValue(new ArrayBuffer(0)),
    writeFileSync: jest.fn().mockReturnValue(0),
    lstatSync: jest.fn().mockReturnValue({
      isFile: () => true,
      size: 1024,
    }),
  }),
  { virtual: true },
);

// Note: photoshop module is NOT mocked globally.
// The host service uses try/catch around require() to detect availability,
// so the module being absent in tests correctly simulates "unavailable".
// Tests that need this module should mock it locally.

jest.mock(
  "premierepro",
  () => ({
    Project: {
      getActiveProject: jest.fn(),
    },
    Application: {
      version: "25.2.0",
    },
    TickTime: {
      fromSeconds: jest.fn((s: number) => ({ seconds: s, toSeconds: () => s })),
    },
    CompoundAction: jest.fn().mockImplementation(() => ({
      addAction: jest.fn(),
      execute: jest.fn().mockResolvedValue(undefined),
    })),
    EncoderManager: {
      getInstance: jest.fn(),
    },
    ClipProjectItem: {
      cast: jest.fn((item: unknown) => item),
    },
    Transcript: {
      createImportTextSegmentsAction: jest.fn().mockReturnValue({ execute: jest.fn() }),
      exportToJSON: jest.fn().mockResolvedValue("{}"),
      importFromJSON: jest.fn().mockReturnValue({}),
    },
    TextSegments: {
      importFromJSON: jest
        .fn()
        .mockImplementation((_json: string, callback: (ts: unknown) => void) => {
          callback({});
          return true;
        }),
    },
  }),
  { virtual: true },
);

// Mock fetch globally
global.fetch = jest.fn();

// Polyfill TextEncoder/TextDecoder for jsdom
if (typeof global.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock crypto.subtle for SHA-256 in AuthService
Object.defineProperty(global, "crypto", {
  value: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
    },
  },
});
