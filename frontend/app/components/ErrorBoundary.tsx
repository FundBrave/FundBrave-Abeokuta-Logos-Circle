"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // FE-L2: Only log in development — avoid leaking stack traces to production logs
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center px-4">
            <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">!</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
              <p className="text-white/60 text-sm mb-4">
                The application encountered an unexpected error. Please try refreshing the page.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="btn-primary"
              >
                Refresh Page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
