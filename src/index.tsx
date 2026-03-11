import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { createLogger, LogLevel, setLogLevel } from "./utils/logger";

const log = createLogger("Plugin");

// Set log level based on environment
if (process.env.NODE_ENV === "production") {
  setLogLevel(LogLevel.WARN);
}

/**
 * UXP Plugin Entry Point.
 * Registers panel lifecycle callbacks and renders the React app.
 */
function setupPlugin(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { entrypoints } = require("uxp");

    let panelRoot: ReturnType<typeof createRoot> | null = null;

    entrypoints.setup({
      plugin: {
        create() {
          log.info("Kaltura panel plugin created");
        },
        destroy() {
          log.info("Kaltura panel plugin destroyed");
        },
      },
      panels: {
        kalturaMainPanel: {
          create(rootNode: HTMLElement) {
            log.info("Panel created");
            panelRoot = createRoot(rootNode);
            panelRoot.render(
              <ErrorBoundary>
                <App />
              </ErrorBoundary>,
            );
          },
          show() {
            log.debug("Panel shown");
          },
          hide() {
            log.debug("Panel hidden");
          },
          destroy() {
            log.info("Panel destroyed");
            panelRoot?.unmount();
            panelRoot = null;
          },
        },
      },
    });
  } catch {
    // Not running inside UXP (development/test environment)
    // Render to a DOM element for standalone testing
    log.info("UXP not available — rendering in standalone mode");
    const container = document.getElementById("root");
    if (container) {
      const root = createRoot(container);
      root.render(
        <ErrorBoundary>
          <App />
        </ErrorBoundary>,
      );
    }
  }
}

setupPlugin();
