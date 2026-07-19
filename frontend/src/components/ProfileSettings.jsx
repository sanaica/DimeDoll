import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';

const ProfileSettings = ({ currentUser }) => {
  const [profile, setProfile] = useState({
    age: 28,
    employment: 'Employed Full-time',
    income: '5L-15L',
    goal: 'Wealth Preservation',
    experience: 'Beginner',
    risk_tolerance: 'Pending evaluation...',
    auto_invest: false,
    occupation: '',
    monthly_savings: '',
    investment_aim: '',
    target_amount: 0,
    target_timeframe: 0,
    intraday_interest: false,
    current_capital: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentUser) {
      fetch(`${API_URL}/api/profile?username=${currentUser}`)
        .then(res => res.json())
        .then(data => {
          if (Object.keys(data).length > 0) {
            setProfile(prev => ({ ...prev, ...data }));
          }
        })
        .catch(err => console.error("Could not load profile", err));
    }
  }, [currentUser]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProfile(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/profile?username=${currentUser}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: parseInt(profile.age) || 25,
          employment: profile.employment,
          income: profile.income,
          goal: profile.goal,
          experience: profile.experience,
          risk_tolerance: profile.risk_tolerance,
          auto_invest: profile.auto_invest,
          occupation: profile.occupation,
          monthly_savings: profile.monthly_savings,
          investment_aim: profile.investment_aim,
          target_amount: parseFloat(profile.target_amount) || 0,
          target_timeframe: parseInt(profile.target_timeframe) || 0,
          intraday_interest: profile.intraday_interest,
          current_capital: parseFloat(profile.current_capital) || 0,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        console.error("Failed to save:", data);
        alert("Failed to save profile. Please check your inputs.");
      } else if (data.ai_risk) {
        setProfile(prev => ({ ...prev, risk_tolerance: data.ai_risk }));
      }
    } catch (err) {
      console.error(err);
      alert("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel">
      <h2 className="section-title">Your Financial Profile</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px', lineHeight: 1.6 }}>
        Tell us about yourself so our AI can give you advice that actually fits your life — not generic tips.
      </p>

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label>Age</label>
            <input type="number" name="age" value={profile.age} onChange={handleChange} className="form-control" />
          </div>
          <div className="form-group">
            <label>Employment Status</label>
            <select name="employment" value={profile.employment} onChange={handleChange} className="form-control">
              <option value="Employed Full-time">Employed Full-time</option>
              <option value="Self-Employed">Self-Employed</option>
              <option value="Freelancer">Freelancer</option>
              <option value="Student">Student</option>
              <option value="Homemaker">Homemaker</option>
              <option value="Retired">Retired</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Occupation</label>
          <input
            type="text"
            name="occupation"
            value={profile.occupation}
            onChange={handleChange}
            className="form-control"
            placeholder="e.g. Software Engineer, Teacher, Doctor"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label>Annual Income (₹)</label>
            <select name="income" value={profile.income} onChange={handleChange} className="form-control">
              <option value="< 5L">&lt; 5 Lakhs</option>
              <option value="5L-15L">5 – 15 Lakhs</option>
              <option value="> 15L">&gt; 15 Lakhs</option>
            </select>
          </div>
          <div className="form-group">
            <label>Monthly Savings</label>
            <select name="monthly_savings" value={profile.monthly_savings} onChange={handleChange} className="form-control">
              <option value="">Select...</option>
              <option value="< 5K">Under ₹5,000</option>
              <option value="5K-20K">₹5,000 – ₹20,000</option>
              <option value="20K-50K">₹20,000 – ₹50,000</option>
              <option value="> 50K">Over ₹50,000</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>What are you investing for?</label>
          <input
            type="text"
            name="investment_aim"
            value={profile.investment_aim}
            onChange={handleChange}
            className="form-control"
            placeholder="e.g. Emergency fund, house down payment, retirement, children's education"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label>Current Capital (₹)</label>
            <input
              type="number"
              name="current_capital"
              value={profile.current_capital || ''}
              onChange={handleChange}
              className="form-control"
              placeholder="What do you have right now?"
            />
          </div>
          <div className="form-group">
            <label>Target Amount (₹)</label>
            <input
              type="number"
              name="target_amount"
              value={profile.target_amount || ''}
              onChange={handleChange}
              className="form-control"
              placeholder="e.g. 500000"
            />
          </div>
          <div className="form-group">
            <label>Timeframe (months)</label>
            <input
              type="number"
              name="target_timeframe"
              value={profile.target_timeframe || ''}
              onChange={handleChange}
              className="form-control"
              placeholder="e.g. 24"
            />
          </div>
        </div>

        <div className="form-group">
          <label>Investment Style</label>
          <select name="goal" value={profile.goal} onChange={handleChange} className="form-control">
            <option value="Short-term Wealth">Short-term growth</option>
            <option value="Wealth Preservation">Steady & safe</option>
            <option value="Retirement">Long-term retirement</option>
          </select>
        </div>

        <div className="form-group">
          <label>Market Experience</label>
          <select name="experience" value={profile.experience} onChange={handleChange} className="form-control">
            <option value="Beginner">I'm just starting out</option>
            <option value="Intermediate">I know the basics</option>
            <option value="Pro">Experienced investor</option>
          </select>
        </div>

        <div className="form-group" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 14px',
          background: 'var(--bg-color)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--panel-border)',
        }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Interested in short-term trades?</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              If yes, AI will include intraday analysis
            </div>
          </div>
          <label className="toggle-label" style={{ width: 'auto' }}>
            <input
              type="checkbox"
              name="intraday_interest"
              checked={profile.intraday_interest}
              onChange={handleChange}
              className="toggle-input"
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label>
            AI-Determined Risk Profile{' '}
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-sage)' }}>(set automatically)</span>
          </label>
          <input
            type="text"
            value={profile.risk_tolerance}
            readOnly
            className="form-control"
            style={{
              border: '1px solid var(--accent-sage)',
              opacity: 0.85,
              cursor: 'not-allowed',
              fontWeight: 600,
              background: 'rgba(122, 158, 108, 0.04)',
            }}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: '12px' }}>
          {saving ? 'Saving...' : 'Save & Update My Profile'}
        </button>
      </form>
    </div>
  );
};

export default ProfileSettings;
