import React, { useState, useEffect } from 'react';
import { Sparkles, Zap, Shield, Target, Clock, RefreshCw, Brain, TrendingUp, Cpu, BrainCircuit } from 'lucide-react';
import StockCard from '../components/StockCard';
import PredictionTracker from '../components/PredictionTracker';
import PortfolioGraph from '../components/PortfolioGraph';
import { useUserProfile } from '../context/UserProfileContext';

const TICKERS = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"];

export default function RecommendationsPage({ ticksData, currentUser, aiThoughts, portfolio: livePortfolio }) {
  const { capital, riskTolerance, horizon, profile } = useUserProfile();
  const [autoAI, setAutoAI] = useState(false);
  const [autoAILoading, setAutoAILoading] = useState(false);
  const [localCapital, setLocalCapital] = useState(null);

  useEffect(() => {
    if (currentUser) {
      fetch(`http://localhost:8000/api/portfolio?username=${currentUser}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.cash !== undefined) {
            setLocalCapital(data.cash);
          }
        })
        .catch(console.error);
    }
  }, [currentUser]);

  const displayCapital = localCapital !== null ? localCapital : (livePortfolio?.cash !== undefined ? livePortfolio.cash : capital);

  // Fetch current auto-AI status on mount
  useEffect(() => {
    fetch('http://localhost:8000/api/auto-ai/status')
      .then(res => res.json())
      .then(data => setAutoAI(data.auto_ai || false))
      .catch(() => {});
  }, []);

  const toggleAutoAI = async () => {
    setAutoAILoading(true);
    try {
      const newState = !autoAI;
      const res = await fetch('http://localhost:8000/api/auto-ai/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newState })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setAutoAI(newState);
      }
    } catch (err) {
      console.error('Failed to toggle auto-AI:', err);
    }
    setAutoAILoading(false);
  };

  const getRiskIcon = () => {
    if (riskTolerance === 'Aggressive') return <Zap size={16} />;
    if (riskTolerance === 'Conservative') return <Shield size={16} />;
    return <Target size={16} />;
  };

  const getRiskColor = () => {
    if (riskTolerance === 'Aggressive') return 'var(--danger-color)';
    if (riskTolerance === 'Conservative') return 'var(--success-color)';
    return 'var(--warning-color)';
  };

  return (
    <div className="advisor-page">
      {/* Hero Header */}
      <div className="advisor-hero">
        <div className="advisor-hero-content">
          <div className="advisor-hero-icon">
            <Brain size={28} />
          </div>
          <div>
            <h1 className="advisor-title">DimeDoll AI Advisor</h1>
            <p className="advisor-subtitle">
              Intelligent, data-driven trade analysis powered by structured reasoning
            </p>
          </div>
        </div>
      </div>

      {/* Profile Summary Strip */}
      <div className="advisor-profile-strip">
        <div className="profile-chip">
          <Target size={14} />
          <span>Capital: ₹{displayCapital.toLocaleString('en-IN')}</span>
        </div>
        <div className="profile-chip" style={{ borderColor: getRiskColor() }}>
          {getRiskIcon()}
          <span style={{ color: getRiskColor() }}>{riskTolerance} Risk</span>
        </div>
        <div className="profile-chip">
          <Clock size={14} />
          <span>{horizon}Y Horizon</span>
        </div>
      </div>

      {/* Auto-AI Toggle */}
      <div className="auto-ai-toggle-card glass-panel">
        <div className="auto-ai-toggle-left">
          <div className="auto-ai-icon-wrap">
            <Cpu size={22} className={autoAI ? 'auto-ai-icon-active' : ''} />
          </div>
          <div>
            <div className="auto-ai-title">Portfolio Auto-Trader AI</div>
            <div className="auto-ai-desc">
              {autoAI 
                ? 'Active. The AI is continuously evaluating your full portfolio and live market data. It will auto-execute trades to maximize profit while managing risk.'
                : 'Disabled. The Auto-Trader acts as a professional fund manager. Enable to let it diversify and invest your available cash automatically.'
              }
            </div>
          </div>
        </div>
        <div className="auto-ai-toggle-right">
          {autoAI && (
            <span className="auto-ai-live-badge">
              <span className="auto-ai-live-dot"></span>
              LIVE
            </span>
          )}
          <label className="toggle-label" style={{ cursor: autoAILoading ? 'wait' : 'pointer' }}>
            <input
              type="checkbox"
              checked={autoAI}
              onChange={toggleAutoAI}
              disabled={autoAILoading}
              className="toggle-input"
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        {/* AI Thoughts Display */}
        {autoAI && aiThoughts && (
          <div style={{
            marginTop: '20px',
            padding: '16px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '8px',
            borderLeft: '4px solid var(--accent-primary)',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start'
          }}>
            <BrainCircuit size={18} style={{ color: 'var(--accent-primary)', marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                AI's Current Thoughts
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {aiThoughts}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Portfolio Graph */}
      <PortfolioGraph portfolio={livePortfolio} ticksData={ticksData} />

      {/* Per-Stock AI Decision Cards */}
      <div className="advisor-section">
        <div className="advisor-section-header">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Manual Analysis</h2>
          <p className="advisor-section-desc">
            {autoAI 
              ? 'Auto-Trader is active. You can still manually analyze individual stocks below.'
              : 'Click any card to get a manual AI-powered trade recommendation.'
            }
          </p>
        </div>

        <div className="bento-grid">
          {TICKERS.map(ticker => (
            <StockCard
              key={ticker}
              symbol={ticker}
              data={ticksData?.[ticker]}
              currentUser={currentUser}
            />
          ))}
        </div>
      </div>

      {/* Prediction Scorecard */}
      <div className="advisor-section">
        <PredictionTracker currentUser={currentUser} />
      </div>
    </div>
  );
}
