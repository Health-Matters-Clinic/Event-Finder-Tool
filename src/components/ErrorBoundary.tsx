import React from 'react';

// @ts-ignore — React class component for error boundary
export class ErrorBoundary extends (React.Component as any) {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f3ef', padding: '2rem', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '1rem' }}>Something went wrong</h1>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>The Event Finder encountered an error. Please try refreshing.</p>
            <button onClick={() => window.location.reload()} style={{ padding: '0.75rem 2rem', background: '#233dff', color: 'white', border: '2px solid black', borderRadius: '9999px', fontWeight: 700, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
