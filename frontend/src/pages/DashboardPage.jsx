import React from 'react';
import TickerWidget from '../components/TickerWidget';
import AIInsightsPanel from '../components/AIInsightsPanel';

const DashboardPage = ({ ticksData, insights }) => {
  const TICKERS = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"];

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '24px' }}>Market Overview</h2>
      <div className="bento-grid">
        {TICKERS.map(ticker => (
          <TickerWidget 
            key={ticker} 
            symbol={ticker} 
            data={ticksData[ticker]} 
          />
        ))}
      </div>
      
      <div style={{ marginTop: '40px' }}>
        <AIInsightsPanel insights={insights} />
      </div>
    </div>
  );
};

export default DashboardPage;
