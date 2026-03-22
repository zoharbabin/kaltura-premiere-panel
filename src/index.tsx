import React from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrowsePanelRoot } from "./panels/BrowsePanelRoot";
import { PublishPanelRoot } from "./panels/PublishPanelRoot";
import { runSettingsCommand, runSignOutCommand } from "./commands";
import { hostService, offlineService, auditService, authService } from "./services/singleton";
import { createLogger, LogLevel, setLogLevel } from "./utils/logger";
import { I18nProvider, detectLocale } from "./i18n";
import "./i18n/loadLocales";

const log = createLogger("Plugin");
const currentLocale = detectLocale();

// Set log level based on environment
if (process.env.NODE_ENV === "production") {
  setLogLevel(LogLevel.WARN);
}

/**
 * UXP Plugin Entry Point.
 *
 * Registers two panels (Media Browser, Publish) and two commands
 * (Settings, Sign Out) via entrypoints.setup().
 */
function setupPlugin(): void {
  try {
    const { entrypoints } = require("uxp");

    let browseRoot: ReturnType<typeof createRoot> | null = null;
    let publishRoot: ReturnType<typeof createRoot> | null = null;

    entrypoints.setup({
      plugin: {
        create() {
          log.info("Kaltura plugin created");
        },
        destroy() {
          log.info("Kaltura plugin destroyed");
        },
      },
      panels: {
        kalturaMediaBrowser: {
          create(rootNode: HTMLElement) {
            log.info("Media Browser panel created");
            rootNode.style.height = "100%";
            rootNode.style.overflow = "hidden";
            browseRoot = createRoot(rootNode);
            browseRoot.render(
              <I18nProvider locale={currentLocale}>
                <ErrorBoundary>
                  <BrowsePanelRoot />
                </ErrorBoundary>
              </I18nProvider>,
            );
          },
          show() {
            log.debug("Media Browser panel shown");
          },
          hide() {
            log.debug("Media Browser panel hidden");
          },
          destroy() {
            log.info("Media Browser panel destroyed");
            browseRoot?.unmount();
            browseRoot = null;
          },
        },
        kalturaPublish: {
          create(rootNode: HTMLElement) {
            log.info("Publish panel created");
            rootNode.style.height = "100%";
            rootNode.style.overflow = "hidden";
            publishRoot = createRoot(rootNode);
            publishRoot.render(
              <I18nProvider locale={currentLocale}>
                <ErrorBoundary>
                  <PublishPanelRoot />
                </ErrorBoundary>
              </I18nProvider>,
            );
          },
          show() {
            log.debug("Publish panel shown");
          },
          hide() {
            log.debug("Publish panel hidden");
          },
          destroy() {
            log.info("Publish panel destroyed");
            publishRoot?.unmount();
            publishRoot = null;
          },
        },
      },
      commands: {
        kalturaSettings: {
          run() {
            return runSettingsCommand(hostService, offlineService, auditService);
          },
        },
        kalturaSignOut: {
          run() {
            return runSignOutCommand(authService);
          },
        },
      },
    });
  } catch {
    // Not running inside UXP (development/test environment)
    // Render the browse panel for standalone testing
    log.info("UXP not available — rendering in standalone mode");
    const container = document.getElementById("root");
    if (container) {
      const root = createRoot(container);
      root.render(
        <I18nProvider locale={currentLocale}>
          <ErrorBoundary>
            <BrowsePanelRoot />
          </ErrorBoundary>
        </I18nProvider>,
      );
    }
  }
}

setupPlugin();
