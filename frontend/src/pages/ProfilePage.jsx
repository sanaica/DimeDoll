import React from 'react';
import ProfileSettings from '../components/ProfileSettings';

const ProfilePage = ({ currentUser }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '40px' }}>
      <div>
        <ProfileSettings currentUser={currentUser} />
      </div>
      
      <div className="glass-panel" style={{ height: 'fit-content' }}>
        <h2 className="section-title">System Status</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Macro Brain (AI)</span>
            <span style={{ color: 'var(--success-color)', fontWeight: 500 }}>Online</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Flash Layer</span>
            <span style={{ color: 'var(--success-color)', fontWeight: 500 }}>Online</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Execution Router</span>
            <span style={{ color: 'var(--success-color)', fontWeight: 500 }}>Auto-Invest</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Ledger (MongoDB)</span>
            <span style={{ color: 'var(--success-color)', fontWeight: 500 }}>Online</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
