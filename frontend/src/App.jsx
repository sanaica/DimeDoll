import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import NavBar from './components/NavBar';
import DashboardPage from './pages/DashboardPage';
import WalletPage from './pages/WalletPage';
import ProfilePage from './pages/ProfilePage';
import AuthPage from './pages/AuthPage';
import AcademyPage from './pages/AcademyPage';
import { UserProfileProvider } from './context/UserProfileContext';
import { API_URL, WS_URL } from './config';

const SimulatedBanner = () => (
  <div style={{
    textAlign: 'center',
    padding: '6px 0',
    background: 'rgba(196, 131, 90, 0.06)',
    borderBottom: '1px solid rgba(196, 131, 90, 0.12)',
    fontSize: '0.72rem',
    color: '#C4835A',
    fontWeight: 500,
    letterSpacing: '0.3px',
  }}>
    🎓 Simulated portfolio · No real money is involved · Built for learning
  </div>
);

const ProtectedLayout = ({ children, wsStatus }) => {
  return (
    <div>
      <SimulatedBanner />
      <div className="dashboard-container">
        <NavBar wsStatus={wsStatus} />
        {children}
      </div>
    </div>
  );
};

function MainApp() {
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('dimedoll_user'));
  const [ticksData, setTicksData] = useState({});
  const [insights, setInsights] = useState({});
  const [wsStatus, setWsStatus] = useState('connecting');
  const [executedTrades, setExecutedTrades] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [aiThoughts, setAiThoughts] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (currentUser) {
      fetch(`${API_URL}/api/portfolio?username=${currentUser}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.cash !== undefined) {
            setPortfolio(data);
          }
        })
        .catch(err => console.error("Could not load initial portfolio", err));

      fetch(`${API_URL}/api/profile?username=${currentUser}`)
        .then(res => res.json())
        .then(data => {
          if (Object.keys(data).length === 0 && location.pathname !== '/profile') {
            navigate('/profile');
          }
        });
    }
  }, [currentUser]);

  // WebSocket with exponential backoff
  useEffect(() => {
    if (!currentUser) return;

    let ws;
    let reconnectTimer;
    let backoff = 1000;
    const MAX_BACKOFF = 30000;

    const connectWs = () => {
      ws = new WebSocket(`${WS_URL}/ws/live-ticks`);

      ws.onopen = () => {
        setWsStatus('connected');
        backoff = 1000; // reset on success
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'initial_data' || message.type === 'ticks_update') {
            const dataArr = message.data;
            setTicksData(prev => {
              const next = { ...prev };
              dataArr.forEach(item => {
                next[item.ticker] = {
                  price: item.price,
                  timestamp: item.timestamp,
                  history: item.history,
                  insight: item.insight,
                };
              });
              return next;
            });
            setInsights(prev => {
              const next = { ...prev };
              dataArr.forEach(item => {
                if (item.insight && Object.keys(item.insight).length > 0) {
                  next[item.ticker] = item.insight;
                }
              });
              return next;
            });
          } else if (message.type === 'trade_execution' || message.type === 'auto_trader_execution') {
            setExecutedTrades(prev => [...message.data, ...prev]);
          } else if (message.type === 'portfolio_update') {
            setPortfolio(message.data);
          } else if (message.type === 'auto_trader_thoughts') {
            setAiThoughts(message.data);
          } else if (message.type === 'auto_trader_analysis') {
            setAiAnalysis(message.data);
          }
        } catch (error) {
          console.error('Error parsing websocket message', error);
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        reconnectTimer = setTimeout(() => {
          backoff = Math.min(backoff * 1.5, MAX_BACKOFF);
          connectWs();
        }, backoff);
      };

      ws.onerror = () => ws.close();
    };

    connectWs();
    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [currentUser]);

  const handleLogout = () => {
    localStorage.removeItem('dimedoll_user');
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <AuthPage onAuthSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <UserProfileProvider currentUser={currentUser}>
      <ProtectedLayout wsStatus={wsStatus}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={
            <DashboardPage ticksData={ticksData} insights={insights} currentUser={currentUser} portfolio={portfolio} />
          } />
          <Route path="/wallet" element={
            <WalletPage 
              portfolio={portfolio} 
              ticksData={ticksData} 
              executedTrades={executedTrades} 
              currentUser={currentUser} 
              aiThoughts={aiThoughts}
              aiAnalysis={aiAnalysis}
            />
          } />
          <Route path="/profile" element={
            <ProfilePage currentUser={currentUser} portfolio={portfolio} onLogout={handleLogout} />
          } />
          <Route path="/academy" element={
            <AcademyPage />
          } />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ProtectedLayout>
    </UserProfileProvider>
  );
}

function App() {
  return (
    <Router>
      <MainApp />
    </Router>
  );
}

export default App;
