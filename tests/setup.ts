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
      },
    },
  }),
  { virtual: true },
);

// Note: aftereffects and audition modules are NOT mocked globally.
// The host services use try/catch around require() to detect availability,
// so the modules being absent in tests correctly simulates "unavailable".
// Tests that need these modules should mock them locally.

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
