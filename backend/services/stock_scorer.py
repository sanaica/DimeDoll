import yfinance as yf
import logging

logger = logging.getLogger(__name__)

def scan_red_flags(ticker: str) -> list[dict]:
    """
    Run deterministic rules against available yfinance fundamentals.
    """
    try:
        t = yf.Ticker(ticker)
        info = t.info
    except Exception as e:
        logger.error(f"Error fetching info for {ticker}: {e}")
        info = {}

    flags = []

    # 1. Leverage: debt-to-equity > 2 (FAIL)
    # Note: Yahoo Finance debtToEquity is often returned as a percentage (e.g., 250 for 2.5) or a ratio.
    # We will assume it's a ratio or percentage. Usually > 200 if percentage, > 2 if ratio.
    # To be safe, let's treat it as a ratio if < 100, or just > 2.0. If it's a percentage, > 200.
    # Usually in yfinance, debtToEquity > 200 means > 2.0.
    dte = info.get("debtToEquity")
    if dte is None:
        flags.append({"rule": "Leverage", "status": "NA", "value": None, "threshold": "D/E > 2", "reason": "Missing debt-to-equity data"})
    else:
        # Normalize if it's percentage
        normalized_dte = dte / 100.0 if dte > 20 else dte
        if normalized_dte > 2.0:
            flags.append({"rule": "Leverage", "status": "FAIL", "value": round(normalized_dte, 2), "threshold": "D/E > 2", "reason": "High debt load"})
        else:
            flags.append({"rule": "Leverage", "status": "PASS", "value": round(normalized_dte, 2), "threshold": "D/E > 2"})

    # 2. Cash Flow Quality: operating cash flow negative while net profit positive (FAIL)
    ocf = info.get("operatingCashflow")
    net_income = info.get("netIncomeToCommon")
    if ocf is None or net_income is None:
        flags.append({"rule": "Cash Flow Quality", "status": "NA", "value": None, "threshold": "OCF < 0 and Net Income > 0", "reason": "Missing cash flow or income data"})
    else:
        if ocf < 0 and net_income > 0:
            flags.append({"rule": "Cash Flow Quality", "status": "FAIL", "value": {"OCF": ocf, "NetIncome": net_income}, "threshold": "OCF < 0 and Net Income > 0", "reason": "Profitable on paper, but burning cash"})
        else:
            flags.append({"rule": "Cash Flow Quality", "status": "PASS", "value": {"OCF": ocf, "NetIncome": net_income}, "threshold": "OCF < 0 and Net Income > 0"})

    # 3. Interest Coverage: interest coverage ratio < 2 (WARN)
    # yfinance info rarely has direct interestCoverage, we might have ebitda and totalDebt.
    # If not found, NA.
    ebitda = info.get("ebitda")
    interest_expense = info.get("interestExpense", 0) # sometimes negative, sometimes positive
    if ebitda is None or not interest_expense:
        flags.append({"rule": "Interest Coverage", "status": "NA", "value": None, "threshold": "EBITDA/Interest < 2", "reason": "Missing EBITDA or Interest Expense"})
    else:
        cov = abs(ebitda / interest_expense)
        if cov < 2.0:
            flags.append({"rule": "Interest Coverage", "status": "WARN", "value": round(cov, 2), "threshold": "Coverage < 2", "reason": "Low ability to service debt"})
        else:
            flags.append({"rule": "Interest Coverage", "status": "PASS", "value": round(cov, 2), "threshold": "Coverage < 2"})

    return flags

def compute_scorecard(ticker: str) -> dict:
    """
    Weighted 0-10 score based on Momentum, Financial Health, and Red Flags.
    """
    try:
        t = yf.Ticker(ticker)
        info = t.info
        hist = t.history(period="1y")
    except Exception as e:
        logger.error(f"Error computing scorecard for {ticker}: {e}")
        info = {}
        hist = None

    momentum_score = 5.0
    momentum_data = {}
    
    if hist is not None and len(hist) > 200:
        closes = hist['Close']
        current = closes.iloc[-1]
        ma50 = closes.tail(50).mean()
        ma200 = closes.tail(200).mean()
        
        # Momentum logic:
        # If price > MA50 > MA200 -> Strong uptrend (10)
        # If price < MA50 < MA200 -> Strong downtrend (0)
        # In between -> 5
        if current > ma50 and ma50 > ma200:
            momentum_score = 9.0
        elif current < ma50 and ma50 < ma200:
            momentum_score = 2.0
        elif current > ma50:
            momentum_score = 7.0
        elif current < ma50:
            momentum_score = 4.0
            
        momentum_data = {
            "current_price": round(current, 2),
            "ma50": round(ma50, 2),
            "ma200": round(ma200, 2)
        }
    
    # Financial Health logic:
    health_score = 5.0
    roe = info.get("returnOnEquity")
    dte = info.get("debtToEquity")
    
    health_data = {}
    if roe is not None:
        health_data["roe"] = roe
        if roe > 0.15: # > 15% ROE is good
            health_score += 2.0
        elif roe < 0:
            health_score -= 2.0
            
    if dte is not None:
        normalized_dte = dte / 100.0 if dte > 20 else dte
        health_data["debtToEquity"] = normalized_dte
        if normalized_dte < 1.0:
            health_score += 2.0
        elif normalized_dte > 2.0:
            health_score -= 2.0
            
    health_score = max(0.0, min(10.0, health_score))
    
    # Sub-scores
    sub_scores = {
        "Momentum": {"score": momentum_score, "weight": 0.5, "data": momentum_data},
        "Financial Health": {"score": health_score, "weight": 0.5, "data": health_data},
    }
    
    # Weighted base score
    base_score = (momentum_score * 0.5) + (health_score * 0.5)
    
    # Apply red flag penalties
    flags = scan_red_flags(ticker)
    penalty = 0.0
    for f in flags:
        if f["status"] == "FAIL":
            penalty += 1.0
        elif f["status"] == "WARN":
            penalty += 0.5
            
    final_score = max(0.0, min(10.0, base_score - penalty))
    
    return {
        "ticker": ticker,
        "final_score": round(final_score, 2),
        "base_score": round(base_score, 2),
        "penalty": penalty,
        "sub_scores": sub_scores,
        "red_flags": flags
    }
