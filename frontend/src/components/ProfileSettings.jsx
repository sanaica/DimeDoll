import React, { useState, useEffect } from 'react';

const ProfileSettings = ({ currentUser }) => {
  const [profile, setProfile] = useState({
    age: 30,
    employment: 'Employed Full-time',
    income: '5L-15L',
    goal: 'Wealth Preservation',
    experience: 'Beginner',
    risk_tolerance: 'Pending AI Evaluation...',
    auto_invest: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentUser) {
      fetch(`http://localhost:8000/api/profile?username=${currentUser}`)
        .then(res => res.json())
        .then(data => {
          if (Object.keys(data).length > 0) {
            setProfile(data);
          }
        })
        .catch(err => console.error("Could not load profile", err));
    }
  }, [currentUser]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProfile(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:8000/api/profile?username=${currentUser}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: parseInt(profile.age),
          employment: profile.employment,
          income: profile.income,
          goal: profile.goal,
          experience: profile.experience,
          risk_tolerance: profile.risk_tolerance,
          auto_invest: profile.auto_invest
        })
      });
      const data = await res.json();
      if (data.ai_risk) {
          setProfile(prev => ({ ...prev, risk_tolerance: data.ai_risk }));
      }
      setTimeout(() => setSaving(false), 500);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel profile-panel">
      <h2 className="section-title">Deep Risk Engine</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '20px' }}>
        Complete your financial context for safe AI execution.
      </p>

      <form onSubmit={handleSave} className="profile-form">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label>Age</label>
            <input type="number" name="age" value={profile.age} onChange={handleChange} className="form-control" />
          </div>
          <div className="form-group">
            <label>Employment</label>
            <select name="employment" value={profile.employment} onChange={handleChange} className="form-control">
              <option value="Employed Full-time">Employed</option>
              <option value="Self-Employed">Self-Employed</option>
              <option value="Student">Student</option>
              <option value="Retired">Retired</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Annual Income (₹)</label>
          <select name="income" value={profile.income} onChange={handleChange} className="form-control">
            <option value="< 5L">&lt; 5 Lakhs</option>
            <option value="5L-15L">5 Lakhs - 15 Lakhs</option>
            <option value="> 15L">&gt; 15 Lakhs</option>
          </select>
        </div>

        <div className="form-group">
          <label>Primary Investment Goal</label>
          <select name="goal" value={profile.goal} onChange={handleChange} className="form-control">
            <option value="Short-term Wealth">Short-term Wealth</option>
            <option value="Wealth Preservation">Wealth Preservation</option>
            <option value="Retirement">Retirement</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Market Experience</label>
          <select name="experience" value={profile.experience} onChange={handleChange} className="form-control">
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Pro">Pro Trader</option>
          </select>
        </div>

        <div className="form-group">
          <label>AI Determined Risk Profile <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)' }}>(Locked)</span></label>
          <input 
            type="text" 
            value={profile.risk_tolerance} 
            readOnly 
            className="form-control" 
            style={{ border: '1px solid var(--accent-color)', opacity: 0.8, cursor: 'not-allowed', fontWeight: 600 }} 
          />
        </div>

        <div className="form-group checkbox-group" style={{ marginTop: '24px', padding: '16px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px' }}>
          <label className="toggle-label">
            <div>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-primary)' }}>Auto-Invest</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Execute AI signals instantly</span>
            </div>
            <input type="checkbox" name="auto_invest" checked={profile.auto_invest} onChange={handleChange} className="toggle-input" />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: '16px' }}>
          {saving ? 'Processing AI Evaluation...' : 'Update & Sync AI'}
        </button>
      </form>
    </div>
  );
};

export default ProfileSettings;
