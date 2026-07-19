import React, { useState } from 'react';
import { Mail, KeyRound, ArrowRight } from 'lucide-react';
import logo from '../assets/logo.png';

const AuthPage = ({ onAuthSuccess }) => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const handleRequestCode = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.status === 'success') {
        setStep(2);
      } else {
        setError(data.message || 'Failed to send code');
      }
    } catch (err) {
      setError('Network error — is the backend running?');
    }
    setLoading(false);
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (data.status === 'success') {
        localStorage.setItem('dimedoll_user', data.username);
        onAuthSuccess(data.username);
      } else {
        setError(data.message || 'Invalid code');
      }
    } catch (err) {
      setError('Network error — is the backend running?');
    }
    setLoading(false);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--bg-color)',
      padding: '20px',
    }}>
      <div className="glass-panel" style={{ width: '420px', padding: '44px 36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <img src={logo} alt="DimeDoll Logo" style={{ height: '110px', width: '110px', objectFit: 'cover', borderRadius: '50%', marginBottom: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }} />
          <h1 className="brand-title" style={{ fontSize: '2.4rem', marginBottom: '8px' }}>
            Dime<span style={{ color: 'var(--accent-sage)' }}>Doll</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Your calm, AI-powered companion for<br />building wealth — at your own pace.
          </p>
          <div className="simulated-badge" style={{ marginTop: '16px' }}>
            🎓 Practice portfolio · No real money involved
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(192, 87, 79, 0.06)',
            color: 'var(--danger-color)',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
            textAlign: 'center',
            fontSize: '0.85rem',
            border: '1px solid rgba(192, 87, 79, 0.15)',
          }}>
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequestCode}>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={14} /> Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-control"
                placeholder="you@example.com"
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                This is a simulated demo environment. No real emails are sent.
              </p>
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              {loading ? 'Sending Code...' : 'Get Sign-In Code'} <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode}>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={14} /> Enter 6-Digit Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="form-control"
                placeholder="123456"
                maxLength={6}
                required
                style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '1.2rem', fontWeight: '600' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                Simulated environment. Use master password: 123456
              </p>
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '20px' }}>
              {loading ? 'Verifying...' : 'Sign In'}
            </button>
            
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  textDecoration: 'underline'
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
