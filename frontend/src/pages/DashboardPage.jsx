import React, { useState, useEffect } from 'react';
import StockCard from '../components/StockCard';
import AIInsightsPanel from '../components/AIInsightsPanel';
import StockSearch from '../components/StockSearch';
import { API_URL } from '../config';

const FALLBACK_TICKERS = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "HINDUNILVR.NS", "SBIN.NS", "BAJFINANCE.NS", "BHARTIARTL.NS", "KOTAKBANK.NS", "ITC.NS", "LT.NS"];

const DashboardPage = ({ ticksData, insights, currentUser, portfolio }) => {
  const [coreTickers, setCoreTickers] = useState([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [autoAiEnabled, setAutoAiEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/tickers/core`)
      .then(res => res.json())
      .then(data => {
        if (data.tickers && data.tickers.length > 0) {
          setCoreTickers(data.tickers);
        } else {
          setCoreTickers(FALLBACK_TICKERS);
        }
      })
      .catch(() => {
        setCoreTickers(Object.keys(ticksData).length > 0 ? Object.keys(ticksData) : FALLBACK_TICKERS);
      });

    fetch(`${API_URL}/api/auto-ai/status`)
      .then(res => res.json())
      .then(data => setAutoAiEnabled(data.auto_ai))
      .catch(err => console.error(err));
  }, []);

  const toggleAutoAi = async () => {
    setToggling(true);
    try {
      const newState = !autoAiEnabled;
      await fetch(`${API_URL}/api/auto-ai/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newState })
      });
      setAutoAiEnabled(newState);
    } catch (err) {
      console.error(err);
    }
    setToggling(false);
  };

  // Show tickers that have live data first, then others
  const tickersWithData = coreTickers.filter(t => ticksData[t]);
  const tickersWithoutData = coreTickers.filter(t => !ticksData[t]).slice(0, 4);
  const displayTickers = [...tickersWithData, ...tickersWithoutData].slice(0, visibleCount);

  if (displayTickers.length === 0) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 20px', marginTop: '20px' }}>
        <div style={{ display: 'inline-block', padding: '12px 24px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
           <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Loading live market data...</h3>
           <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Connecting to National Stock Exchange data feed</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: '4px' }}>Market Overview</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            Live prices from {tickersWithData.length} stocks · Nifty 50 universe
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ 
            background: autoAiEnabled ? 'rgba(107, 143, 94, 0.08)' : 'var(--bg-secondary)', 
            padding: '10px 16px', 
            borderRadius: 'var(--radius-md)', 
            border: `1px solid ${autoAiEnabled ? 'rgba(107, 143, 94, 0.2)' : 'var(--panel-border)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: autoAiEnabled ? 'var(--success-color)' : 'var(--text-secondary)' }}>
              Auto-Invest AI
            </span>
            <label className="toggle-label" style={{ width: 'auto' }}>
              <input 
                type="checkbox" 
                checked={autoAiEnabled} 
                onChange={toggleAutoAi} 
                disabled={toggling}
                className="toggle-input" 
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <StockSearch ticksData={ticksData} currentUser={currentUser} />
        </div>
      </div>

      <div className="bento-grid">
        {displayTickers.map(ticker => (
          <StockCard
            key={ticker}
            symbol={ticker}
            data={ticksData[ticker]}
            currentUser={currentUser}
          />
        ))}
      </div>

      {visibleCount < coreTickers.length && (
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <button
            onClick={() => setVisibleCount(prev => prev + 12)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--panel-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 28px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            Show more stocks ({coreTickers.length - visibleCount} remaining)
          </button>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <AIInsightsPanel insights={insights} />
      </div>
    </div>
  );
};

export default DashboardPage;
