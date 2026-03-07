/** Log levels in order of severity */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

let currentLevel: LogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function formatMessage(level: string, module: string, message: string): string {
  const timestamp = new Date().toISOString().slice(11, 23);
  return `[${timestamp}] [${level}] [${module}] ${message}`;
}

export function createLogger(module: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      if (currentLevel <= LogLevel.DEBUG) {
        console.debug(formatMessage("DEBUG", module, message), ...args);
      }
    },
    info(message: string, ...args: unknown[]) {
      if (currentLevel <= LogLevel.INFO) {
        console.info(formatMessage("INFO", module, message), ...args);
      }
    },
    warn(message: string, ...args: unknown[]) {
      if (currentLevel <= LogLevel.WARN) {
        console.warn(formatMessage("WARN", module, message), ...args);
      }
    },
    error(message: string, ...args: unknown[]) {
      if (currentLevel <= LogLevel.ERROR) {
        console.error(formatMessage("ERROR", module, message), ...args);
      }
    },
  };
}
