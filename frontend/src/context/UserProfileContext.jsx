import React, { createContext, useContext, useState, useEffect } from 'react';

const UserProfileContext = createContext(null);

export function UserProfileProvider({ children, currentUser }) {
  const [profile, setProfile] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setProfile(null);
      setPortfolio(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    Promise.all([
      fetch(`http://localhost:8000/api/profile?username=${currentUser}`)
        .then(res => res.json())
        .catch(() => ({})),
      fetch(`http://localhost:8000/api/portfolio?username=${currentUser}`)
        .then(res => res.json())
        .catch(() => ({ cash: 0, holdings: {}, total_deposited: 0 }))
    ]).then(([prof, port]) => {
      setProfile(prof);
      setPortfolio(port);
      setLoading(false);
    });
  }, [currentUser]);

  const value = {
    profile,
    portfolio,
    loading,
    capital: portfolio?.cash !== undefined ? portfolio.cash : 50000,
    riskTolerance: profile?.risk_tolerance || 'Moderate',
    horizon: 5,
    refreshProfile: async () => {
      if (!currentUser) return;
      const res = await fetch(`http://localhost:8000/api/profile?username=${currentUser}`);
      const data = await res.json();
      setProfile(data);
    },
    updatePortfolio: (newPortfolio) => {
      setPortfolio(newPortfolio);
    }
  };

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return ctx;
}

export default UserProfileContext;
