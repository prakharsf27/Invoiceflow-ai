import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Card className="p-6 border-rose-200 bg-rose-50/30 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {this.props.fallbackTitle || 'Something went wrong rendering this section'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {this.props.fallbackMessage ||
                this.state.error?.message ||
                'An unexpected error occurred while displaying this content. The rest of the application remains operational.'}
            </p>
          </div>
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
