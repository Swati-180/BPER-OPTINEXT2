import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  props!: Props;
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('UI render error caught by AppErrorBoundary:', error);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-red-50 p-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-[#102846]">Something went wrong while loading this section</h3>
              <p className="mt-1 text-sm text-[#5F7898]">
                The app prevented a blank screen and recovered safely. Please reload to continue.
              </p>
              <button
                type="button"
                onClick={this.handleReload}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#165BAA] px-4 py-2 text-sm font-semibold text-white hover:bg-[#124B8E]"
              >
                <RefreshCcw className="h-4 w-4" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
