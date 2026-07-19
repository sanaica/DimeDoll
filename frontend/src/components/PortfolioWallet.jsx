import React, { useState, useEffect } from 'react';
import { useUserProfile } from '../context/UserProfileContext';
import { API_URL } from '../config';

const PortfolioWallet = ({ portfolio, ticksData, currentUser }) => {
  const { updatePortfolio } = useUserProfile();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [autoAiEnabled, setAutoAiEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/auto-ai/status`)
      .then(res => res.json())
      .then(data => setAutoAiEnabled(data.auto_ai))
      .catch(err => console.error(err));
  }, []);

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0 || !currentUser) return;

    setDepositing(true);
    try {
      const res = await fetch(`${API_URL}/api/portfolio/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, amount })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setDepositAmount('');
        updatePortfolio({
          ...portfolio,
          cash: (portfolio?.cash || 0) + amount,
          total_deposited: (portfolio?.total_deposited || 0) + amount
        });
      }
    } catch (err) {
      console.error(err);
    }
    setDepositing(false);
  };

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

  if (!portfolio) {
    return (
      <div className="glass-panel" style={{ padding: '30px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading portfolio...</p>
      </div>
    );
  }

  const holdings = portfolio.holdings || {};
  let totalHoldingsValue = 0;
  
  const holdingsList = Object.entries(holdings).map(([ticker, qty]) => {
    const currentPrice = ticksData[ticker]?.price || 0;
    const value = currentPrice * qty;
    totalHoldingsValue += value;
    return { ticker, qty, currentPrice, value };
  });

  const totalValue = portfolio.cash + totalHoldingsValue;
  const totalReturn = totalValue - (portfolio.total_deposited || 0);
  const returnPercent = portfolio.total_deposited ? (totalReturn / portfolio.total_deposited) * 100 : 0;

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Total Value</h2>
            <span className="simulated-badge" style={{ padding: '2px 8px', fontSize: '0.65rem' }}>Simulated Money</span>
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 700, fontFamily: 'Outfit', letterSpacing: '-0.5px' }}>
            ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <div style={{ 
            color: totalReturn >= 0 ? 'var(--success-color)' : 'var(--danger-color)', 
            fontSize: '0.9rem',
            fontWeight: 500,
            marginTop: '4px'
          }}>
            {totalReturn >= 0 ? '+' : ''}₹{totalReturn.toLocaleString('en-IN', { maximumFractionDigits: 2 })} 
            {' '}({totalReturn >= 0 ? '+' : ''}{returnPercent.toFixed(2)}%)
          </div>
        </div>
        
        <div style={{ 
          background: autoAiEnabled ? 'rgba(107, 143, 94, 0.08)' : 'var(--bg-secondary)', 
          padding: '16px', 
          borderRadius: 'var(--radius-md)', 
          border: `1px solid ${autoAiEnabled ? 'rgba(107, 143, 94, 0.2)' : 'var(--panel-border)'}`,
          width: '200px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
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
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {autoAiEnabled 
              ? "Agent 2 is actively monitoring and managing your portfolio." 
              : "Agent 2 is sleeping. Turn on to allow autonomous execution."}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
        <div style={{ background: 'var(--bg-color)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Available Cash</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'Outfit' }}>
            ₹{portfolio.cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>
        
        <div style={{ background: 'var(--bg-color)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>Total Invested</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, fontFamily: 'Outfit' }}>
            ₹{totalHoldingsValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '1.05rem', marginBottom: '16px' }}>Add Simulated Funds</h3>
        <form onSubmit={handleDeposit} style={{ display: 'flex', gap: '12px' }}>
          <input 
            type="number" 
            value={depositAmount} 
            onChange={e => setDepositAmount(e.target.value)} 
            placeholder="Amount in ₹" 
            className="form-control"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={depositing || !depositAmount} className="btn-primary" style={{ width: 'auto', padding: '0 24px' }}>
            {depositing ? 'Processing...' : 'Deposit Funds'}
          </button>
        </form>
      </div>

      <div>
        <h3 style={{ fontSize: '1.05rem', marginBottom: '16px' }}>Current Holdings</h3>
        {holdingsList.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            No holdings yet. Deposit simulated funds and let the AI invest!
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--panel-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 8px' }}>Asset</th>
                  <th style={{ padding: '12px 8px' }}>Shares</th>
                  <th style={{ padding: '12px 8px' }}>Live Price</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {holdingsList.map(h => (
                  <tr key={h.ticker} style={{ borderBottom: '1px solid var(--bg-secondary)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600 }}>{h.ticker.replace('.NS', '')}</td>
                    <td style={{ padding: '12px 8px' }}>{h.qty}</td>
                    <td style={{ padding: '12px 8px' }}>₹{h.currentPrice.toFixed(2)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>₹{h.value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioWallet;
