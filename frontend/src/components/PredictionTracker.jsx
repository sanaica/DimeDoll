import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, CheckCircle, XCircle, Clock, X, RefreshCw, Award, BarChart3, Crosshair } from 'lucide-react';
import { API_URL } from '../config';

const PredictionTracker = ({ currentUser }) => {
  const [predictions, setPredictions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [closingId, setClosingId] = useState(null);

  const fetchPredictions = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/predictions?username=${currentUser}`);
      const data = await res.json();
      setPredictions(data.predictions || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Failed to fetch predictions:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPredictions();
    // Auto-refresh every 10 seconds for live P&L updates
    const interval = setInterval(fetchPredictions, 10000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const closePrediction = async (predId, currentPrice) => {
    setClosingId(predId);
    try {
      const res = await fetch(`${API_URL}/api/predictions/${predId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exit_price: currentPrice })
      });
      const data = await res.json();
      if (data.status === 'success') {
        fetchPredictions();
      }
    } catch (err) {
      console.error('Failed to close prediction:', err);
    }
    setClosingId(null);
  };

  if (loading && predictions.length === 0) {
    return (
      <div className="glass-panel prediction-tracker">
        <div className="prediction-tracker-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            <Crosshair size={22} style={{ marginRight: '10px', verticalAlign: 'middle' }} />
            Prediction Scorecard
          </h2>
        </div>
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <RefreshCw size={24} className="spin-icon" style={{ color: 'var(--accent-color)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading predictions...</p>
        </div>
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="glass-panel prediction-tracker">
        <div className="prediction-tracker-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            <Crosshair size={22} style={{ marginRight: '10px', verticalAlign: 'middle' }} />
            Prediction Scorecard
          </h2>
        </div>
        <div className="prediction-empty">
          <Crosshair size={36} style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: '12px' }} />
          <p>No predictions tracked yet.</p>
          <p className="prediction-empty-hint">
            Get an AI decision on any stock and click "Track This Prediction" to start.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel prediction-tracker" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div className="prediction-tracker-header" style={{ padding: '24px 24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            <Crosshair size={22} style={{ marginRight: '10px', verticalAlign: 'middle' }} />
            Prediction Scorecard
          </h2>
          <button onClick={fetchPredictions} className="decision-refresh-btn" style={{ flexShrink: 0 }}>
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} /> Refresh
          </button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '6px' }}>
          Tracking AI decisions vs real market outcomes
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="prediction-summary-grid">
          <div className="prediction-stat-card">
            <div className="prediction-stat-value">{summary.total_predictions}</div>
            <div className="prediction-stat-label">Total</div>
          </div>
          <div className="prediction-stat-card">
            <div className="prediction-stat-value" style={{ color: 'var(--success-color)' }}>
              {summary.accuracy_percent}%
            </div>
            <div className="prediction-stat-label">AI Accuracy</div>
          </div>
          <div className="prediction-stat-card">
            <div className="prediction-stat-value" style={{ color: summary.total_pnl >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
              {summary.total_pnl >= 0 ? '+' : ''}₹{summary.total_pnl.toFixed(2)}
            </div>
            <div className="prediction-stat-label">Total P&L</div>
          </div>
          <div className="prediction-stat-card">
            <div className="prediction-stat-value">
              <span style={{ color: 'var(--success-color)' }}>{summary.correct_count}W</span>
              <span style={{ color: 'var(--text-secondary)', margin: '0 4px' }}>/</span>
              <span style={{ color: 'var(--danger-color)' }}>{summary.wrong_count}L</span>
            </div>
            <div className="prediction-stat-label">Win / Loss</div>
          </div>
        </div>
      )}

      {/* Prediction List */}
      <div className="prediction-list">
        {predictions.map((pred) => (
          <div key={pred.id} className={`prediction-row ${pred.status === 'closed' ? 'prediction-row-closed' : ''}`}>
            {/* Left: Ticker + Decision */}
            <div className="prediction-row-left">
              <div className="prediction-row-ticker">
                {pred.ticker.replace('.NS', '')}
                {pred.source === 'auto_trader' && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--accent-color)', marginLeft: '6px', background: 'rgba(108, 92, 231, 0.1)', padding: '2px 4px', borderRadius: '4px' }}>
                    [Auto]
                  </span>
                )}
              </div>
              <span className={`prediction-decision-badge prediction-decision-${pred.decision.toLowerCase()}`}>
                {pred.decision}
              </span>
              <span className="prediction-time">{pred.time_elapsed_display}</span>
            </div>

            {/* Center: Prices + P&L */}
            <div className="prediction-row-center">
              <div className="prediction-prices">
                <span className="prediction-price-label">Entry</span>
                <span className="prediction-price-value">₹{pred.entry_price.toFixed(2)}</span>
              </div>
              <div className="prediction-arrow">→</div>
              <div className="prediction-prices">
                <span className="prediction-price-label">{pred.status === 'closed' ? 'Exit' : 'Now'}</span>
                <span className="prediction-price-value">₹{(pred.current_price || pred.entry_price).toFixed(2)}</span>
              </div>
              <div className={`prediction-pnl ${pred.pnl_amount >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                <span className="prediction-pnl-amount">
                  {pred.pnl_amount >= 0 ? '+' : ''}₹{pred.pnl_amount.toFixed(2)}
                </span>
                <span className="prediction-pnl-percent">
                  ({pred.pnl_percent >= 0 ? '+' : ''}{pred.pnl_percent.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Right: Correct/Wrong + Actions */}
            <div className="prediction-row-right">
              {pred.was_correct !== null && pred.was_correct !== undefined ? (
                <div className={`prediction-verdict ${pred.was_correct ? 'verdict-correct' : 'verdict-wrong'}`}>
                  {pred.was_correct ? <CheckCircle size={15} /> : <XCircle size={15} />}
                  <span>{pred.was_correct ? 'AI Right' : 'AI Wrong'}</span>
                </div>
              ) : (
                <div className="prediction-verdict verdict-neutral">
                  <Clock size={15} />
                  <span>Neutral</span>
                </div>
              )}

              {pred.status === 'open' ? (
                <button
                  onClick={() => closePrediction(pred.id, pred.current_price)}
                  disabled={closingId === pred.id}
                  className="prediction-close-btn"
                >
                  {closingId === pred.id ? (
                    <RefreshCw size={12} className="spin-icon" />
                  ) : (
                    <X size={12} />
                  )}
                  Close
                </button>
              ) : (
                <span className="prediction-closed-label">Closed</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PredictionTracker;
