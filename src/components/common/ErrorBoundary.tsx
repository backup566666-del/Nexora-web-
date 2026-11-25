import React from 'react';
import { NexoraLogo } from '../branding/NexoraLogo';
import { NexoraParticleBackdrop } from '../branding/NexoraParticleBackdrop';
import { recordErrorDiagnostic } from '../../services/firebase/errorHandler';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Nexora ErrorBoundary caught:', error?.name || 'Error');
    void recordErrorDiagnostic({
      category: 'runtime',
      feature: 'ui:error-boundary',
      err: {
        message: error?.message || 'UI render failure',
        stack: `${error?.stack || ''}\n${info?.componentStack || ''}`,
      },
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="relative min-h-screen bg-[#06060A] text-[#F8FAFC] flex items-center justify-center p-6 overflow-hidden">
          <NexoraParticleBackdrop variant="subtle" />
          <div className="relative z-10 max-w-lg w-full bg-[#0D0D14]/92 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-5">
            <NexoraLogo size="md" animation="assemble" />
            <div className="space-y-2">
              <h1 className="font-display text-xl font-semibold text-white">
                Something interrupted this view
              </h1>
              <p className="text-sm text-[#94A3B8] leading-relaxed">
                We ran into an unexpected issue loading this screen. Reload Nexora to get back to where you left off.
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
