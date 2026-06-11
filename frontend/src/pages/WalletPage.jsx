import React from 'react';
import PortfolioWallet from '../components/PortfolioWallet';
import TradeExecutionLog from '../components/TradeExecutionLog';

const WalletPage = ({ portfolio, ticksData, executedTrades, currentUser }) => {
  return (
    <div>
      <PortfolioWallet portfolio={portfolio} livePrices={ticksData} currentUser={currentUser} />
      
      <div style={{ marginTop: '40px' }}>
        <TradeExecutionLog trades={executedTrades} />
      </div>
    </div>
  );
};

export default WalletPage;
