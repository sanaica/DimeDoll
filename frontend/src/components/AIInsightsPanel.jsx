import React from 'react';

const AIInsightsPanel = ({ insights }) => {
  if (!insights || Object.keys(insights).length === 0) {
    return (
      <div className="glass-panel">
        <h2 className="section-title">Macro Brain Insights</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Waiting for DTW pattern match data...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--panel-border)' }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>Macro Brain Insights</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
          DTW Pattern Matching & LLM Evaluation
        </p>
      </div>
      
      <div>
        {Object.entries(insights).map(([symbol, insight]) => (
          <div key={symbol} className="insight-item">
            <div style={{ flex: 1 }}>
              <div className="insight-symbol">{symbol}</div>
              <div className="insight-pattern">{insight.pattern}</div>
              
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>Confidence Match</span>
                  <span>{insight.confidence}%</span>
                </div>
                <div className="confidence-bar-bg">
                  <div 
                    className="confidence-bar-fill" 
                    style={{ width: `${insight.confidence}%` }}
                  ></div>
                </div>
              </div>
            </div>
            
            <div style={{ marginLeft: '24px' }}>
              <span className={`action-badge action-${insight.action.toLowerCase()}`}>
                {insight.action}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AIInsightsPanel;
