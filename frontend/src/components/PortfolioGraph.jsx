import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

const COLORS = ['#6c5ce7', '#00b894', '#0984e3', '#e84393', '#fdcb6e', '#d63031'];

export default function PortfolioGraph({ portfolio, ticksData }) {
  if (!portfolio) return null;

  const cash = portfolio.cash || 0;
  const holdings = portfolio.holdings || {};

  // Construct chart data
  const data = [];
  
  if (cash > 0) {
    data.push({ name: 'Cash', value: cash });
  }

  Object.entries(holdings).forEach(([ticker, quantity]) => {
    // Try to get live price, fallback to 0 if not available
    const livePrice = ticksData?.[ticker]?.price || 0;
    const value = quantity * livePrice;
    if (value > 0) {
      data.push({ name: ticker.replace('.NS', ''), value: value });
    }
  });

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  // Custom tooltip formatter
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = ((data.value / totalValue) * 100).toFixed(1);
      return (
        <div className="custom-tooltip" style={{ background: '#1a1b2e', padding: '10px', border: '1px solid #2d2e42', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: '#fff' }}>{data.name}</p>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
            ₹{data.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ({percent}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="advisor-section" style={{ marginTop: '30px' }}>
      <div className="advisor-section-header">
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          <PieChartIcon size={22} style={{ marginRight: '10px', verticalAlign: 'middle' }} />
          Portfolio Allocation
        </h2>
        <p className="advisor-section-desc">
          Live visual breakdown of how the Auto-Trader has divided your assets
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '20px', height: '350px' }}>
        {totalValue === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            No assets found.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={80}
                outerRadius={120}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => <span style={{ color: '#fff' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
