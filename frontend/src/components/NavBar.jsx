import React from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../assets/logo.png';

const NavBar = ({ wsStatus }) => {
  return (
    <header className="header" style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src={logo} alt="DimeDoll Logo" style={{ height: '52px', width: '52px', objectFit: 'cover', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }} />
          <div>
            <h1 className="brand-title" style={{ fontSize: '1.8rem', marginBottom: 0 }}>
              Dime<span>Doll</span>
            </h1>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Your calm financial companion
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: '6px' }}>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Home
          </NavLink>
          <NavLink to="/wallet" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            My Portfolio
          </NavLink>
          <NavLink to="/academy" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Academy
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            My Profile
          </NavLink>
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="simulated-badge">🎓 Research & education only — not investment advice. Simulated portfolio, no real money.</span>
        <div className={`status-badge ${wsStatus === 'disconnected' ? 'disconnected' : ''}`}>
          <div className="status-dot"></div>
          {wsStatus === 'connected' ? 'Live' : 'Reconnecting...'}
        </div>
      </div>
    </header>
  );
};

export default NavBar;
