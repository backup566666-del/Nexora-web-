import React from 'react';
import { NexoraLogo } from '../branding/NexoraLogo';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected application error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Nexora ErrorBoundary caught:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#06060A] text-[#F8FAFC] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#0D0D14] border border-white/10 rounded-2xl p-8 space-y-5">
            <NexoraLogo size="md" />
            <div className="space-y-2">
              <h1 className="font-display text-xl font-semibold text-white">
                Something interrupted this view
              </h1>
              <p className="text-sm text-[#94A3B8] leading-relaxed">
                {this.state.errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-medium transition-colors"
            >
              Reload Nexora
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
