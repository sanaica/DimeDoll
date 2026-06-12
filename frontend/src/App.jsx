import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import NavBar from './components/NavBar';
import DashboardPage from './pages/DashboardPage';
import WalletPage from './pages/WalletPage';
import ProfilePage from './pages/ProfilePage';
import AuthPage from './pages/AuthPage';
import SimulatorPage from './pages/SimulatorPage';
import RecommendationsPage from './pages/RecommendationsPage';
import { UserProfileProvider } from './context/UserProfileContext';

const ProtectedLayout = ({ children, wsStatus, currentUser }) => {
  return (
    <div className="dashboard-container">
      <NavBar wsStatus={wsStatus} />
      {children}
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
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (currentUser) {
      fetch(`http://localhost:8000/api/portfolio?username=${currentUser}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.cash !== undefined) {
            setPortfolio(data);
          }
        })
        .catch(err => console.error("Could not load initial portfolio", err));
        
      fetch(`http://localhost:8000/api/profile?username=${currentUser}`)
        .then(res => res.json())
        .then(data => {
           // Enforce Onboarding: if no risk profile set, force to profile page
           if (Object.keys(data).length === 0 && location.pathname !== '/profile') {
               navigate('/profile');
           }
        });
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    
    let ws;
    let reconnectInterval;

    const connectWs = () => {
      ws = new WebSocket('ws://localhost:8000/ws/live-ticks');

      ws.onopen = () => {
        setWsStatus('connected');
        if (reconnectInterval) clearInterval(reconnectInterval);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'initial_data' || message.type === 'ticks_update') {
            const dataArr = message.data;
            const newTicks = { ...ticksData };
            const newInsights = { ...insights };
            
            dataArr.forEach(item => {
              newTicks[item.ticker] = { price: item.price, timestamp: item.timestamp, history: item.history, insight: item.insight };
              if (item.insight && Object.keys(item.insight).length > 0) {
                newInsights[item.ticker] = item.insight;
              }
            });
            
            setTicksData(prev => ({ ...prev, ...newTicks }));
            setInsights(prev => ({ ...prev, ...newInsights }));
          } else if (message.type === 'trade_execution') {
            setExecutedTrades(prev => [...message.data, ...prev]);
          } else if (message.type === 'portfolio_update') {
            setPortfolio(message.data);
          } else if (message.type === 'auto_trader_thoughts') {
            setAiThoughts(message.data);
          }
        } catch (error) {
          console.error('Error parsing websocket message', error);
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        reconnectInterval = setTimeout(connectWs, 3000);
      };

      ws.onerror = (error) => ws.close();
    };

    connectWs();
    return () => {
      if (ws) ws.close();
      if (reconnectInterval) clearInterval(reconnectInterval);
    };
  }, [currentUser]);

  if (!currentUser) {
    return <AuthPage onAuthSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <UserProfileProvider currentUser={currentUser}>
      <ProtectedLayout wsStatus={wsStatus} currentUser={currentUser}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage ticksData={ticksData} insights={insights} currentUser={currentUser} portfolio={portfolio} />} />
          <Route path="/wallet" element={<WalletPage portfolio={portfolio} ticksData={ticksData} executedTrades={executedTrades} currentUser={currentUser} />} />
          <Route path="/profile" element={<ProfilePage currentUser={currentUser} portfolio={portfolio} />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/recommendations" element={<RecommendationsPage ticksData={ticksData} currentUser={currentUser} aiThoughts={aiThoughts} portfolio={portfolio} />} />
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
