import React, { useState } from 'react';
import PortfolioWallet from '../components/PortfolioWallet';
import TradeExecutionLog from '../components/TradeExecutionLog';
import PredictionTracker from '../components/PredictionTracker';
import PortfolioChart from '../components/PortfolioChart';
import { Clock, Play } from 'lucide-react';

const WalletPage = ({ portfolio, ticksData, executedTrades, currentUser, aiThoughts, aiAnalysis }) => {
  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="brand-title" style={{ fontSize: '2rem', marginBottom: '8px' }}>My Portfolio</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Manage your Auto-Invest settings and track AI prediction accuracy.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <PortfolioChart currentUser={currentUser} portfolio={portfolio} ticksData={ticksData} />
          
          {portfolio?.auto_invest ? (
            <div className="glass-panel" style={{ background: 'rgba(25, 126, 114, 0.05)', border: '1px solid rgba(25, 126, 114, 0.2)' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} /> Live Risk Analyst Stream
              </h3>
              {typeof aiAnalysis === 'string' ? (
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{aiAnalysis}</div>
              ) : aiAnalysis ? (
                <div>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.85rem', background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--panel-border)' }}>
                      <strong>Risk Level:</strong> <span style={{ color: aiAnalysis.risk_level === 'High' ? 'var(--danger-color)' : aiAnalysis.risk_level === 'Low' ? 'var(--success-color)' : 'var(--text-primary)' }}>{aiAnalysis.risk_level}</span>
                    </span>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}><strong>Summary:</strong> {aiAnalysis.risk_summary}</p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}><strong>Reasoning:</strong> {aiAnalysis.overall_reasoning}</p>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Waiting for Agent 1 (Risk Analyst) to broadcast...
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(25, 126, 114, 0.05)', border: '1px solid rgba(25, 126, 114, 0.2)' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Manual AI Analysis</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Auto-Invest is off. You can manually run the AI 3-stage chain to get recommendations.</p>
              </div>
              <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Play size={16} /> Run Analysis
              </button>
            </div>
          )}

          <PortfolioWallet 
            portfolio={portfolio} 
            ticksData={ticksData} 
            currentUser={currentUser} 
          />
          <PredictionTracker currentUser={currentUser} />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Recent AI Thoughts Stream */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '500px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <Clock size={16} /> Auto-Trader Stream
            </h3>
            {aiThoughts ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, overflowY: 'auto', paddingRight: '8px' }}>
                "{aiThoughts}"
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Waiting for Agent 2 to broadcast thoughts. Turn on Auto-Invest on your Home tab to see live execution reasoning.
              </div>
            )}
          </div>
          <TradeExecutionLog trades={executedTrades} />
        </div>
      </div>
    </div>
  );
};

export default WalletPage;
