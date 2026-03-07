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
      localFileSystem: {},
    },
  }),
  { virtual: true },
);

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

// Mock crypto.subtle for SHA-256 in AuthService
Object.defineProperty(global, "crypto", {
  value: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
    },
  },
});
