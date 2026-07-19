import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, Activity } from 'lucide-react';

const TickerWidget = ({ symbol, data, currentUser, portfolio }) => {
  const [flashClass, setFlashClass] = useState('');
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(false);
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

  const getAIDecision = async () => {
    if (!currentUser || loading) return;
    setLoading(true);
    setDecision(null);
    try {
      // Get the profile to populate the request
      const profRes = await fetch(`http://localhost:8000/api/profile?username=${currentUser}`);
      const profile = await profRes.json();
      
      const payload = {
        ticker: symbol,
        capital: portfolio?.cash || 0,
        risk_tolerance: profile.risk_tolerance || "Moderate",
        horizon: 5,
        current_price: data.price,
        ma50: data.price * 0.98, // Dummy data for demonstration since we don't have historicals easily accessible here
        ma200: data.price * 0.95 
      };

      const res = await fetch('http://localhost:8000/api/trade-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      setDecision(result);
    } catch (err) {
      console.error(err);
      setDecision({ error: "Failed to get AI decision" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`glass-panel ${flashClass} flex flex-col justify-between h-full relative`}>
      <div>
        <div className="ticker-header flex justify-between items-start">
          <div>
            <span className="ticker-symbol block text-xl font-bold">{symbol}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }} className="flex items-center gap-1">
              <Activity size={12} /> Live Flash Layer
            </span>
          </div>
          <div className="ticker-price text-right text-2xl font-semibold">
            ₹{data.price.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-700/50 pt-4">
        {decision ? (
          <div className="text-sm p-3 rounded bg-gray-800/80 border border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <span className={`font-bold px-2 py-1 rounded text-xs ${
                decision.decision === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
                decision.decision === 'SELL' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
              }`}>
                {decision.decision || 'UNKNOWN'}
              </span>
              <span className="text-gray-400 text-xs">Conf: {decision.confidence || 0}%</span>
            </div>
            <p className="text-gray-300 leading-relaxed text-xs">{decision.reasoning || decision.error}</p>
            <button 
              onClick={() => setDecision(null)}
              className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 block w-full text-center"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <button 
            onClick={getAIDecision}
            disabled={loading}
            className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-indigo-500/30"
          >
            {loading ? (
              <span className="animate-pulse">Consulting AI...</span>
            ) : (
              <>
                <Sparkles size={16} /> Get AI Trade Decision
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default TickerWidget;
