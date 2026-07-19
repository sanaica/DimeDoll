import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

const PortfolioChart = ({ currentUser, portfolio, ticksData }) => {
  const [fetchedData, setFetchedData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [localHistory, setLocalHistory] = useState([]);
  const seeded = React.useRef(false);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const res = await fetch(`${API_URL}/api/portfolio/history?username=${currentUser}`);
        const result = await res.json();
        if (result.history && !seeded.current) {
          setLocalHistory(result.history);
          seeded.current = true;
        }
      } catch (err) {
        console.error("Failed to fetch portfolio history", err);
      }
      setLoading(false);
    };
    
    if (currentUser && !portfolio?.history_log && !seeded.current) {
      fetchHistory();
    } else if (portfolio?.history_log && !seeded.current) {
      // Seed with backend history only once
      setLocalHistory(portfolio.history_log);
      seeded.current = true;
      setLoading(false);
    }
  }, [currentUser, portfolio?.history_log]);

  // High-resolution continuous frontend recording
  useEffect(() => {
    if (portfolio && ticksData && Object.keys(ticksData).length > 0) {
      let totalHoldingsValue = 0;
      const holdings = portfolio.holdings || {};
      Object.entries(holdings).forEach(([ticker, qty]) => {
        totalHoldingsValue += (ticksData[ticker]?.price || 0) * qty;
      });
      const liveValue = portfolio.cash + totalHoldingsValue;
      
      setLocalHistory(prev => {
        const now = new Date().toISOString();
        const newPoint = { date: now, value: liveValue };
        // If it's a completely flat line, you can optionally filter, but keeping it ensures the graph stretches out over time!
        const updated = [...prev, newPoint];
        // Keep the last 150 points (approx 2.5 minutes of 1-second ticks) to prevent browser memory bloat
        return updated.slice(-150);
      });
    }
  }, [ticksData]); // Runs on every live websocket broadcast (usually every 1 second)
  if (loading) {
    return <div className="glass-panel" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading chart...</div>;
  }

  if (!localHistory || localHistory.length === 0) {
    return null;
  }

  const displayData = localHistory.length === 1 ? [localHistory[0], { ...localHistory[0], date: 'Now' }] : localHistory;

  const formatTooltipDate = (dateStr) => {
    if (!dateStr || dateStr === 'Now') return 'Now';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-IN', { 
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true 
      });
    } catch (e) {
      return dateStr;
    }
  };

  const startValue = portfolio?.total_deposited || displayData[0].value;
  const endValue = displayData[displayData.length - 1].value;
  const isProfitable = endValue >= startValue;
  const color = isProfitable ? 'var(--success-color)' : 'var(--danger-color)';

  return (
    <div className="glass-panel" style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--text-secondary)' }}>Portfolio Performance</h3>
      <div style={{ height: '250px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={displayData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip 
              contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--panel-border)', borderRadius: '8px' }}
              itemStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
              formatter={(value) => [`₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 'Net Worth']}
              labelFormatter={formatTooltipDate}
              labelStyle={{ color: 'var(--text-secondary)', marginBottom: '4px' }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke={color} 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorValue)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PortfolioChart;
