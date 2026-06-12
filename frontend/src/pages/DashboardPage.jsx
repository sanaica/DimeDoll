import React from 'react';
import StockCard from '../components/StockCard';
import AIInsightsPanel from '../components/AIInsightsPanel';

const DashboardPage = ({ ticksData, insights, currentUser, portfolio }) => {
  const TICKERS = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"];

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '24px' }}>Market Overview</h2>
      <div className="bento-grid">
        {TICKERS.map(ticker => (
          <StockCard 
            key={ticker} 
            symbol={ticker} 
            data={ticksData[ticker]}
            currentUser={currentUser}
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
