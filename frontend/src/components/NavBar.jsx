import React from 'react';
import { NavLink } from 'react-router-dom';

const NavBar = ({ wsStatus }) => {
  return (
    <header className="header" style={{ marginBottom: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
        <div>
          <h1 className="brand-title" style={{ fontSize: '2rem', marginBottom: 0 }}>DimeDoll</h1>
        </div>
        
        <nav style={{ display: 'flex', gap: '24px' }}>
          <NavLink 
            to="/" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Dashboard
          </NavLink>
          <NavLink 
            to="/wallet" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Ledger & Wallet
          </NavLink>
          <NavLink 
            to="/profile" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Risk Engine
          </NavLink>
          <NavLink 
            to="/simulator" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Simulator
          </NavLink>
          <NavLink 
            to="/recommendations" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            AI Advisor
          </NavLink>
        </nav>
      </div>
      
      <div className={`status-badge ${wsStatus === 'disconnected' ? 'disconnected' : ''}`}>
        <div className="status-dot"></div>
        {wsStatus === 'connected' ? 'Flash Layer Active' : 'Flash Layer Disconnected'}
      </div>
    </header>
  );
};

export default NavBar;
