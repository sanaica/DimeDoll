from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import google.generativeai as genai
from anthropic import Anthropic
import yfinance as yf
import os
import json
from dotenv import load_dotenv
from datetime import datetime

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)

router = APIRouter()

# Don't configure here if API key might be missing at startup.
# We'll handle it inside the endpoint or rely on user env variables.
if os.getenv("GEMINI_API_KEY"):
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

claude = None
if os.getenv("ANTHROPIC_API_KEY"):
    claude = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

class UserProfile(BaseModel):
    capital: float
    risk_tolerance: str  # "Conservative", "Moderate", "Aggressive"
    age: int
    goals: str
    horizon: int  # years

@router.post("/recommend")
async def get_recommendations(profile: UserProfile):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(400, "Gemini API key not configured")
    
    # Configure in case it wasn't available at startup
    genai.configure(api_key=api_key)
    
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    prompt = f"""
    You are a calm, ethical financial advisor. User details:
    - Capital: ₹{profile.capital}
    - Risk Tolerance: {profile.risk_tolerance}
    - Age: {profile.age}
    - Goals: {profile.goals}
    - Investment Horizon: {profile.horizon} years
    
    Provide 3-4 diversified investment recommendations suitable for Indian market.
    Include allocation percentages, reasoning, and expected risk/return.
    Keep tone supportive and educational.
    """
    
    try:
        response = model.generate_content(prompt)
        return {
            "recommendations": response.text,
            "timestamp": "now"
        }
    except Exception as e:
        raise HTTPException(500, f"Error generating recommendations: {str(e)}")

class TradeDecisionRequest(BaseModel):
    ticker: str
    capital: float = 50000
    risk_tolerance: str = "Moderate"
    horizon: int = 5

def parse_json(text):
    try:
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return json.loads(text.strip())
    except Exception as e:
        return {"error": "Failed to parse JSON", "raw": text}

def compute_trend_description(series):
    """Compute a human-readable trend description from a price series."""
    if len(series) < 5:
        return "Insufficient data"
    
    recent = series.tail(5)
    older = series.tail(20).head(15) if len(series) >= 20 else series.head(max(1, len(series) - 5))
    
    recent_avg = recent.mean()
    older_avg = older.mean()
    
    pct_change = ((recent_avg - older_avg) / older_avg) * 100
    
    if pct_change > 1.5:
        return f"Strong uptrend (+{pct_change:.1f}% recent momentum)"
    elif pct_change > 0.3:
        return f"Mild uptrend (+{pct_change:.1f}% recent momentum)"
    elif pct_change < -1.5:
        return f"Strong downtrend ({pct_change:.1f}% recent decline)"
    elif pct_change < -0.3:
        return f"Mild downtrend ({pct_change:.1f}% recent decline)"
    else:
        return f"Sideways consolidation ({pct_change:+.1f}%)"


@router.post("/ai-trade-decision")
async def get_ai_trade_decision(req: TradeDecisionRequest):
    """Enhanced AI trade decision with real intraday data and structured reasoning."""
    try:
        # Fetch fresh intraday data from yfinance
        stock = yf.Ticker(req.ticker)
        hist = stock.history(period="5d", interval="15m")
        
        if hist.empty:
            raise HTTPException(400, f"No data available for ticker: {req.ticker}")
        
        # Extract key metrics
        current = float(hist['Close'].iloc[-1])
        series = hist['Close'].dropna()
        
        # Today's session data
        today = datetime.now().strftime('%Y-%m-%d')
        today_data = hist[hist.index.strftime('%Y-%m-%d') == today]
        
        if not today_data.empty:
            open_price = float(today_data['Open'].iloc[0])
            day_high = float(today_data['High'].max())
            day_low = float(today_data['Low'].min())
        else:
            # Use latest session if today has no data (weekend/holiday)
            last_date = hist.index[-1].strftime('%Y-%m-%d')
            last_day = hist[hist.index.strftime('%Y-%m-%d') == last_date]
            open_price = float(last_day['Open'].iloc[0])
            day_high = float(last_day['High'].max())
            day_low = float(last_day['Low'].min())
        
        # Compute moving averages from intraday candles
        ma50 = float(series.rolling(50).mean().iloc[-1]) if len(series) > 50 else None
        ma200 = float(series.rolling(200).mean().iloc[-1]) if len(series) > 200 else None
        
        # Compute trend description
        trend = compute_trend_description(series)
        
        # Volume trend
        vol_series = hist['Volume'].dropna()
        avg_vol = float(vol_series.mean()) if len(vol_series) > 0 else 0
        recent_vol = float(vol_series.tail(5).mean()) if len(vol_series) >= 5 else avg_vol
        vol_trend = "Above average" if recent_vol > avg_vol * 1.1 else "Below average" if recent_vol < avg_vol * 0.9 else "Normal"
        
        # Build the structured prompt
        prompt = f"""
You are DimeDoll AI — a calm, ethical, and data-driven financial advisor.

User Profile:
- Capital: ₹{req.capital:,.0f}
- Risk Tolerance: {req.risk_tolerance}
- Investment Horizon: {req.horizon} years

Stock: {req.ticker}
Current Price: ₹{current:.2f}
Intraday: Open ₹{open_price:.2f} | High ₹{day_high:.2f} | Low ₹{day_low:.2f}
50-candle MA: {'₹' + f'{ma50:.2f}' if ma50 else 'N/A (insufficient data)'}
200-candle MA: {'₹' + f'{ma200:.2f}' if ma200 else 'N/A (insufficient data)'}
Recent Trend: {trend}
Volume Trend: {vol_trend} (Recent avg: {recent_vol:,.0f} vs Overall avg: {avg_vol:,.0f})

Analyze step-by-step and give a clear recommendation:
1. Technical setup (including intraday momentum and MA positioning)
2. Risk-reward assessment for this specific user profile
3. Market context and sector considerations

Respond **only in valid JSON** with this exact structure:
{{
  "decision": "BUY" or "SELL" or "HOLD",
  "confidence": 65,
  "reasoning": "2-3 sentence clear explanation",
  "suggested_allocation": 15,
  "intraday_note": "Short-term view for today"
}}
"""

        # Try Gemini first
        try:
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash')
            response = model.generate_content(prompt)
            result = parse_json(response.text)
            
            # Attach metadata
            result["ticker"] = req.ticker
            result["current_price"] = current
            result["intraday"] = {
                "open": round(open_price, 2),
                "high": round(day_high, 2),
                "low": round(day_low, 2)
            }
            result["ma50"] = round(ma50, 2) if ma50 else None
            result["ma200"] = round(ma200, 2) if ma200 else None
            result["trend"] = trend
            result["volume_trend"] = vol_trend
            result["timestamp"] = datetime.now().isoformat()
            
            return result
            
        except Exception as gemini_err:
            print(f"Gemini error: {str(gemini_err)}")
            
            # Fallback to Claude
            if claude:
                try:
                    message = claude.messages.create(
                        model="claude-3-5-sonnet-20240620",
                        max_tokens=800,
                        messages=[{"role": "user", "content": prompt}]
                    )
                    result = parse_json(message.content[0].text)
                    result["ticker"] = req.ticker
                    result["current_price"] = current
                    result["intraday"] = {
                        "open": round(open_price, 2),
                        "high": round(day_high, 2),
                        "low": round(day_low, 2)
                    }
                    result["timestamp"] = datetime.now().isoformat()
                    return result
                except Exception as claude_err:
                    print(f"Claude error: {str(claude_err)}")
                    raise HTTPException(500, f"Both Gemini and Claude failed. Claude: {str(claude_err)}")
            
            raise HTTPException(500, f"Gemini failed and no Claude fallback: {str(gemini_err)}")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# Keep legacy endpoint for backward compatibility
class LegacyTradeRequest(BaseModel):
    ticker: str
    capital: float
    risk_tolerance: str
    horizon: int
    current_price: float = 0.0
    ma50: float = 0.0
    ma200: float = 0.0

@router.post("/trade-decision")
async def get_legacy_trade_decision(req: LegacyTradeRequest):
    """Legacy endpoint — redirects to the enhanced version."""
    enhanced_req = TradeDecisionRequest(
        ticker=req.ticker,
        capital=req.capital,
        risk_tolerance=req.risk_tolerance,
        horizon=req.horizon
    )
    return await get_ai_trade_decision(enhanced_req)
