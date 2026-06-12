import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Activity, TrendingUp, TrendingDown, BarChart3, Clock, Target, RefreshCw, Crosshair } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { useUserProfile } from '../context/UserProfileContext';

const StockCard = ({ symbol, data, currentUser }) => {
  const { capital, riskTolerance, horizon } = useUserProfile();
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(false);
  const [flashClass, setFlashClass] = useState('');
  const [tracked, setTracked] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const prevPriceRef = useRef(data?.price);

  useEffect(() => {
    if (data?.price && prevPriceRef.current) {
      if (data.price > prevPriceRef.current) {
        setFlashClass('flash-up');
        setTimeout(() => setFlashClass(''), 1000);
      } else if (data.price < prevPriceRef.current) {
        setFlashClass('flash-down');
        setTimeout(() => setFlashClass(''), 1000);
      }
    }
    prevPriceRef.current = data?.price;
  }, [data?.price]);

  const fetchDecision = async () => {
    setLoading(true);
    setDecision(null);
    setTracked(false);
    try {
      const res = await fetch('http://localhost:8000/api/ai-trade-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: symbol,
          capital: capital,
          risk_tolerance: riskTolerance,
          horizon: horizon
        })
      });
      const result = await res.json();
      setDecision(result);
    } catch (err) {
      console.error(err);
      setDecision({ error: 'Failed to reach AI advisor. Check backend connection.' });
    }
    setLoading(false);
  };

  const trackPrediction = async () => {
    if (!decision || !currentUser || tracked) return;
    setTrackingLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/predictions/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: symbol,
          decision: decision.decision,
          confidence: decision.confidence,
          reasoning: decision.reasoning || '',
          entry_price: decision.current_price || data?.price || 0,
          suggested_allocation: decision.suggested_allocation,
          username: currentUser
        })
      });
      const result = await res.json();
      if (result.status === 'success') {
        setTracked(true);
      }
    } catch (err) {
      console.error('Failed to track prediction:', err);
    }
    setTrackingLoading(false);
  };

  const getDecisionColor = (dec) => {
    if (dec === 'BUY') return 'var(--success-color)';
    if (dec === 'SELL') return 'var(--danger-color)';
    return 'var(--warning-color)';
  };

  const getDecisionBg = (dec) => {
    if (dec === 'BUY') return 'rgba(16, 185, 129, 0.12)';
    if (dec === 'SELL') return 'rgba(239, 68, 68, 0.12)';
    return 'rgba(245, 158, 11, 0.12)';
  };

  if (!data) {
    return (
      <div className="stock-card glass-panel">
        <div className="stock-card-header">
          <span className="stock-card-symbol">{symbol}</span>
        </div>
        <div className="stock-card-price-loading">
          <div className="shimmer-line" style={{ width: '60%', height: '32px' }}></div>
          <div className="shimmer-line" style={{ width: '40%', height: '16px', marginTop: '8px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`stock-card glass-panel ${flashClass}`}>
      {/* Header: Symbol + Live Price */}
      <div className="stock-card-header">
        <div>
          <div className="stock-card-symbol">{symbol.replace('.NS', '')}</div>
          <div className="stock-card-exchange">
            <Activity size={10} />
            NSE • Live
          </div>
        </div>
        <div className="stock-card-price-block">
          <div className="stock-card-price">₹{data.price.toFixed(2)}</div>
        </div>
      </div>

      {/* Mini Line Chart */}
      {data.history && data.history.length > 0 && (
        <div style={{ height: '60px', marginTop: '10px', marginBottom: '10px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.history}>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke={data.history[data.history.length - 1].price >= data.history[0].price ? '#00b894' : '#d63031'} 
                strokeWidth={2} 
                dot={false} 
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Intraday Metadata (shows after AI decision) */}
      {decision && decision.intraday && (
        <div className="stock-card-intraday-strip">
          <div className="intraday-chip">
            <TrendingUp size={11} />
            H: ₹{decision.intraday.high}
          </div>
          <div className="intraday-chip">
            <TrendingDown size={11} />
            L: ₹{decision.intraday.low}
          </div>
          {decision.ma50 && (
            <div className="intraday-chip">
              <BarChart3 size={11} />
              MA50: ₹{decision.ma50}
            </div>
          )}
        </div>
      )}

      {/* AI Decision Panel */}
      {decision && !decision.error ? (
        <div className="stock-card-decision" style={{ borderColor: getDecisionColor(decision.decision) }}>
          <div className="decision-top-row">
            <span className="decision-badge" style={{ 
              color: getDecisionColor(decision.decision), 
              background: getDecisionBg(decision.decision),
              borderColor: getDecisionColor(decision.decision)
            }}>
              {decision.decision}
            </span>
            <span className="decision-confidence">
              {decision.confidence}% confident
            </span>
          </div>

          {/* Confidence Bar */}
          <div className="decision-confidence-bar-bg">
            <div 
              className="decision-confidence-bar-fill"
              style={{ 
                width: `${decision.confidence}%`,
                background: `linear-gradient(90deg, ${getDecisionColor(decision.decision)}88, ${getDecisionColor(decision.decision)})`
              }}
            ></div>
          </div>

          {/* Reasoning */}
          <p className="decision-reasoning">{decision.reasoning}</p>

          {/* Allocation + Intraday Note */}
          <div className="decision-meta-grid">
            {decision.suggested_allocation && (
              <div className="decision-meta-item">
                <Target size={13} />
                <span>Allocate {decision.suggested_allocation}% of capital</span>
              </div>
            )}
            {decision.intraday_note && (
              <div className="decision-meta-item">
                <Clock size={13} />
                <span>{decision.intraday_note}</span>
              </div>
            )}
          </div>

          {/* Trend + Volume */}
          {(decision.trend || decision.volume_trend) && (
            <div className="decision-trend-strip">
              {decision.trend && <span className="trend-tag">{decision.trend}</span>}
              {decision.volume_trend && <span className="trend-tag">Vol: {decision.volume_trend}</span>}
            </div>
          )}

          {/* Track Prediction Button (only for BUY/SELL) */}
          {(decision.decision === 'BUY' || decision.decision === 'SELL') && (
            <div className="decision-track-row">
              {tracked ? (
                <div className="decision-tracked-badge">
                  <Crosshair size={13} />
                  Prediction Tracked — Check Scorecard
                </div>
              ) : (
                <button 
                  onClick={trackPrediction}
                  disabled={trackingLoading}
                  className="decision-track-btn"
                >
                  {trackingLoading ? (
                    <><RefreshCw size={13} className="spin-icon" /> Saving...</>
                  ) : (
                    <><Crosshair size={13} /> Track This Prediction</>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="decision-actions">
            <button onClick={() => { setDecision(null); setTracked(false); }} className="decision-dismiss-btn">
              Dismiss
            </button>
            <button onClick={fetchDecision} className="decision-refresh-btn">
              <RefreshCw size={13} /> Re-analyze
            </button>
          </div>
        </div>
      ) : decision && decision.error ? (
        <div className="stock-card-decision stock-card-error">
          <p className="decision-reasoning">{decision.error || decision.raw}</p>
          <button onClick={() => setDecision(null)} className="decision-dismiss-btn">Dismiss</button>
        </div>
      ) : (
        <div className="stock-card-bottom">
          {/* Display Math Indicator */}
          {data.insight && (
            <div className="math-indicator-strip" style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              background: 'rgba(255,255,255,0.02)',
              padding: '8px 12px',
              borderRadius: '8px',
              marginBottom: '12px',
              fontSize: '0.8rem'
            }}>
              <div style={{ color: 'var(--text-secondary)' }}>
                <Activity size={12} style={{ display: 'inline', marginRight: '4px' }}/>
                Math Indicator
              </div>
              <div style={{ color: getDecisionColor(data.insight.action), fontWeight: 600 }}>
                {data.insight.action} ({data.insight.pattern})
              </div>
            </div>
          )}

          <button 
            onClick={fetchDecision}
            disabled={loading}
            className="stock-card-ai-btn"
          >
          {loading ? (
            <>
              <RefreshCw size={16} className="spin-icon" />
              <span>Consulting DimeDoll AI...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Get AI Decision</span>
            </>
          )}
        </button>
        </div>
      )}
    </div>
  );
};

export default StockCard;
