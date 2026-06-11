import React from 'react';

const TradeExecutionLog = ({ trades }) => {
  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
      <div style={{ marginBottom: '16px', flexShrink: 0 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>Execution Router Log</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Simulated Auto-Invest Executions
        </p>
      </div>

      <div className="execution-log-container" style={{ overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
        {trades.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', marginTop: '20px' }}>
            No trades executed yet. Enable Auto-Invest.
          </p>
        ) : (
          [...trades].reverse().map((trade, idx) => (
            <div key={idx} className="execution-item">
              <div className="execution-header">
                <span className="execution-action">✅ {trade.action}</span>
                <span className="execution-ticker">{trade.ticker}</span>
              </div>
              <div className="execution-details">
                Executed at ₹{trade.price.toFixed(2)}
              </div>
              <div className="execution-reason">
                {trade.reason}
              </div>
              <div className="execution-time">
                {new Date(trade.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TradeExecutionLog;
