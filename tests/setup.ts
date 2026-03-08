import "@testing-library/jest-dom";

// Mock UXP modules that aren't available outside Premiere Pro
jest.mock(
  "uxp",
  () => ({
    entrypoints: {
      setup: jest.fn(),
    },
    storage: {
      secureStorage: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
        removeItem: jest.fn().mockResolvedValue(undefined),
      },
      localFileSystem: {
        getTemporaryFolder: jest.fn().mockResolvedValue({
          createFile: jest.fn().mockImplementation((fileName: string) =>
            Promise.resolve({
              write: jest.fn().mockResolvedValue(undefined),
              nativePath: `/tmp/kaltura-download/${fileName}`,
            }),
          ),
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
