import React, { useEffect, useState, useRef } from 'react';

const TickerWidget = ({ symbol, data }) => {
  const [flashClass, setFlashClass] = useState('');
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

  if (!data) {
    return (
      <div className="glass-panel">
        <div className="ticker-header">
          <span className="ticker-symbol">{symbol}</span>
        </div>
        <div className="ticker-price" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={`glass-panel ${flashClass}`}>
      <div className="ticker-header">
        <span className="ticker-symbol">{symbol}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Live Flash Layer</span>
      </div>
      <div className="ticker-price">
        ₹{data.price.toFixed(2)}
      </div>
    </div>
  );
};

export default TickerWidget;
