import React from "react";
import { createLogger } from "../utils/logger";

const log = createLogger("ErrorBoundary");

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Top-level React error boundary.
 * Catches uncaught exceptions so they never propagate into UXP's
 * scripting engine (which can corrupt state and crash Premiere Pro).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: "" };
  private recoverRef = React.createRef<HTMLDivElement>();

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || "Unknown error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error("Uncaught error in React tree", {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(_prevProps: Props, prevState: State): void {
    if (this.state.hasError && !prevState.hasError) {
      this.recoverRef.current?.focus();
    }
  }

  private handleRecover = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "24px",
            /* no gap — use margin on children */
            textAlign: "center",
          }}
        >
          <sp-heading size="S">Something went wrong</sp-heading>
          <sp-body size="S">{this.state.errorMessage}</sp-body>
          <div ref={this.recoverRef} tabIndex={-1} style={{ outline: "none" }}>
            <sp-button variant="primary" onClick={this.handleRecover}>
              Recover
            </sp-button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
