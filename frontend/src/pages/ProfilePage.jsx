import React, { useState } from 'react';
import { Sparkles, RefreshCw, TrendingUp } from 'lucide-react';
import ProfileSettings from '../components/ProfileSettings';
import { useUserProfile } from '../context/UserProfileContext';
import { API_URL } from '../config';

const ProfilePage = ({ currentUser, portfolio: livePortfolio, onLogout }) => {
  const { riskTolerance, horizon, profile } = useUserProfile();
  const [recommendations, setRecommendations] = useState(null);
  const [recLoading, setRecLoading] = useState(false);

  const fetchRecommendations = async () => {
    setRecLoading(true);
    try {
      const actualCapital = livePortfolio?.cash !== undefined ? livePortfolio.cash : 0;
      const payload = {
        username: currentUser,
        capital: actualCapital,
        risk_tolerance: riskTolerance,
        age: profile?.age !== undefined ? profile.age : 30,
        goals: profile?.goal || "Wealth",
        horizon: horizon
      };

      const res = await fetch(`${API_URL}/api/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      setRecommendations(data.recommendations);
    } catch (err) {
      console.error(err);
      setRecommendations("Error fetching recommendations. Please ensure your backend is running and the OpenRouter API key is configured.");
    } finally {
      setRecLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '40px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        <ProfileSettings currentUser={currentUser} />

        {/* Portfolio Recommendations Section */}
        <div className="glass-panel">
          <div className="advisor-section-header">
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              <TrendingUp size={22} style={{ marginRight: '10px', verticalAlign: 'middle' }} />
              Portfolio Recommendations
            </h2>
            <p className="advisor-section-desc">
              Get holistic, diversified advice tailored to your financial profile
            </p>
          </div>

          <button
            onClick={fetchRecommendations}
            disabled={recLoading}
            className="advisor-generate-btn"
            style={{ marginBottom: recommendations ? '20px' : '0' }}
          >
            {recLoading ? (
              <>
                <RefreshCw size={18} className="spin-icon" />
                Analyzing your profile...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Generate Portfolio Recommendations
              </>
            )}
          </button>

          {recommendations && (
            <div className="advisor-recommendations-panel glass-panel" style={{ marginTop: '0' }}>
              <div 
                className="advisor-recommendations-content"
                dangerouslySetInnerHTML={{ 
                  __html: recommendations
                    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                    .replace(/\*(.*?)\*/g, '<i>$1</i>')
                    .replace(/\n\n/g, '<br/><br/>')
                    .replace(/\n- (.*?)/g, '<br/>• $1')
                    .replace(/\n\* (.*?)/g, '<br/>• $1')
                }}
              />
            </div>
          )}
        </div>
      </div>
      
      <div className="glass-panel" style={{ height: 'fit-content' }}>
        <h2 className="section-title">System Status</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Agent 1 (Risk Analyst)</span>
            <span style={{ color: 'var(--success-color)', fontWeight: 500 }}>Online</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Agent 2 (Executor)</span>
            <span style={{ color: 'var(--success-color)', fontWeight: 500 }}>Auto-Invest</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Market Data Feed</span>
            <span style={{ color: 'var(--success-color)', fontWeight: 500 }}>Online</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Ledger (MongoDB)</span>
            <span style={{ color: 'var(--success-color)', fontWeight: 500 }}>Online</span>
          </div>
        </div>
        
        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--panel-border)' }}>
          <button 
            onClick={onLogout}
            className="btn-primary" 
            style={{ width: '100%', background: 'rgba(192, 87, 79, 0.1)', color: 'var(--danger-color)', border: '1px solid rgba(192, 87, 79, 0.2)' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
