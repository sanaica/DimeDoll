import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, ExternalLink, Activity } from 'lucide-react';
import { API_URL } from '../config';

const StockSearch = ({ ticksData, currentUser }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_URL}/api/tickers/search?q=${query}`);
        const data = await res.json();
        setResults(data.results || []);
        setIsOpen(true);
      } catch (err) {
        console.error("Search failed:", err);
      }
      setIsSearching(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (ticker) => {
    setQuery('');
    setIsOpen(false);
    // Future enhancement: Add to personal watchlist
    alert(`Selected ${ticker.symbol}. Watchlist feature coming soon!`);
  };

  return (
    <div className="stock-search-container" ref={searchRef} style={{ position: 'relative', width: '300px' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="form-control"
          placeholder="Search NSE stocks..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          style={{ paddingLeft: '36px', borderRadius: 'var(--radius-md)' }}
        />
        <Search 
          size={16} 
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} 
        />
        {isSearching && (
          <Activity 
            size={14} 
            className="spin-icon" 
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-sage)' }} 
          />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          background: 'var(--panel-bg)',
          border: '1px solid var(--panel-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 50,
          maxHeight: '300px',
          overflowY: 'auto',
          padding: '8px 0'
        }}>
          {results.map((result) => (
            <div 
              key={result.symbol}
              onClick={() => handleSelect(result)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--bg-secondary)',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-color)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Outfit' }}>
                  {result.symbol.replace('.NS', '')}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {result.name}
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {result.tier === 'core' && (
                  <span style={{ 
                    fontSize: '0.65rem', 
                    padding: '2px 6px', 
                    background: 'rgba(122, 158, 108, 0.1)', 
                    color: 'var(--accent-sage)', 
                    borderRadius: '4px' 
                  }}>
                    Live
                  </span>
                )}
                <button style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {isOpen && !isSearching && query.length >= 2 && results.length === 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          background: 'var(--panel-bg)',
          border: '1px solid var(--panel-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 50,
          padding: '20px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem'
        }}>
          No stocks found matching "{query}"
        </div>
      )}
    </div>
  );
};

export default StockSearch;
