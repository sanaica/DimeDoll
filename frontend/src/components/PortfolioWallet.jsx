import React, { useState } from 'react';

const PortfolioWallet = ({ portfolio, livePrices, currentUser }) => {
  const [depositAmount, setDepositAmount] = useState('');
  const [loading, setLoading] = useState(false);
  
  if (!portfolio) {
    return <div className="glass-panel"><p>Loading Wallet Data...</p></div>;
  }

  const holdings = portfolio.holdings || {};
  let totalValue = portfolio.cash;
  
  const holdingsList = Object.keys(holdings).map(ticker => {
    const shares = holdings[ticker];
    const currentPrice = livePrices[ticker] ? livePrices[ticker].price : 0;
    const value = shares * currentPrice;
    totalValue += value;
    
    return { ticker, shares, currentPrice, value };
  });

  const totalDeposited = portfolio.total_deposited || 0;
  const totalReturns = totalValue - totalDeposited;
  const returnsPercentage = totalDeposited > 0 ? (totalReturns / totalDeposited) * 100 : 0;
  const isProfitable = totalReturns >= 0;

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!depositAmount || isNaN(depositAmount) || parseFloat(depositAmount) <= 0) return;
    
    setLoading(true);
    try {
      await fetch(`http://localhost:8000/api/portfolio/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser,
          amount: parseFloat(depositAmount)
        })
      });
      setDepositAmount('');
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '40px' }}>
      <div className="glass-panel" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 className="section-title">Portfolio Snapshot</h2>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Deposited</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '500' }}>
              ₹{totalDeposited.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        
        <div style={{ margin: '32px 0', display: 'flex', gap: '48px', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Equity</div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Available Cash</div>
            <div style={{ fontSize: '2rem', fontWeight: '500', color: 'var(--accent-color)' }}>
              ₹{portfolio.cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ paddingBottom: '6px' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Returns</div>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              color: isProfitable ? 'var(--success-color)' : 'var(--danger-color)',
              background: isProfitable ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              padding: '4px 12px',
              borderRadius: '8px'
            }}>
              {isProfitable ? '+' : ''}₹{totalReturns.toLocaleString('en-IN', { maximumFractionDigits: 2 })} 
              <span style={{ fontSize: '1rem', marginLeft: '8px', opacity: 0.9 }}>
                ({isProfitable ? '+' : ''}{returnsPercentage.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
        
        <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--text-secondary)' }}>Current Holdings</h3>
        {holdingsList.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No active positions. Auto-invest or execute a manual trade to build holdings.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {holdingsList.map(h => (
              <div key={h.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{h.ticker}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{h.shares} Shares</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600 }}>₹{h.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>@ ₹{h.currentPrice.toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ height: 'fit-content' }}>
        <h2 className="section-title" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Add Funds</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '24px' }}>
          Deposit cash to allow the execution router to acquire assets.
        </p>

        <form onSubmit={handleDeposit}>
          <div className="form-group">
            <label>Amount (₹)</label>
            <input 
              type="number" 
              value={depositAmount} 
              onChange={(e) => setDepositAmount(e.target.value)} 
              className="form-control" 
              placeholder="e.g. 100000"
              required 
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '16px', background: 'var(--success-color)' }}>
            {loading ? 'Processing...' : 'Deposit to Ledger'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PortfolioWallet;
