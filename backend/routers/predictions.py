"""
Prediction tracker — tracks AI decisions vs real market outcomes.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from bson import ObjectId
import json
import os
from urllib.parse import urlparse

from database import get_database

router = APIRouter()


from redis.asyncio import Redis
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = Redis.from_url(redis_url, decode_responses=True, health_check_interval=30, retry_on_timeout=True)

class PredictionTrackRequest(BaseModel):
    ticker: str
    decision: str          # BUY / SELL
    confidence: int
    reasoning: str
    entry_price: float
    suggested_allocation: Optional[float] = None
    username: str


class PredictionCloseRequest(BaseModel):
    exit_price: float


@router.post("/predictions/track")
async def track_prediction(req: PredictionTrackRequest):
    """Save an AI prediction to track its accuracy against the real market."""
    if req.decision not in ("BUY", "SELL"):
        raise HTTPException(400, "Only BUY and SELL decisions can be tracked (HOLD has no directional bet).")

    db = get_database()

    prediction = {
        "ticker": req.ticker,
        "decision": req.decision,
        "confidence": req.confidence,
        "reasoning": req.reasoning,
        "entry_price": req.entry_price,
        "suggested_allocation": req.suggested_allocation,
        "username": req.username,
        "status": "open",
        "created_at": datetime.now().isoformat(),
        "closed_at": None,
        "exit_price": None,
    }

    result = await db.ai_predictions.insert_one(prediction)

    return {
        "status": "success",
        "prediction_id": str(result.inserted_id),
        "message": f"Tracking {req.decision} on {req.ticker} at ₹{req.entry_price:.2f}",
    }


@router.get("/predictions")
async def get_predictions(username: str = "default_user"):
    """Fetch all predictions for a user with live P&L computed from Redis-cached prices."""
    db = get_database()

    try:
        cursor = db.ai_predictions.find({"username": username}).sort("created_at", -1)
        predictions = []

        async for doc in cursor:
            pred = {
                "id": str(doc["_id"]),
                "ticker": doc["ticker"],
                "decision": doc["decision"],
                "confidence": doc["confidence"],
                "reasoning": doc["reasoning"],
                "entry_price": doc["entry_price"],
                "suggested_allocation": doc.get("suggested_allocation"),
                "status": doc["status"],
                "created_at": doc["created_at"],
                "closed_at": doc.get("closed_at"),
                "exit_price": doc.get("exit_price"),
                "source": doc.get("source", "manual"),
            }

            # Compute live P&L for open predictions
            if doc["status"] == "open":
                cached = await redis_client.get(f"ticker:{doc['ticker']}")
                if cached:
                    tick_data = json.loads(cached)
                    current_price = tick_data["price"]
                else:
                    current_price = doc["entry_price"]

                pred["current_price"] = current_price
                pred = _compute_pnl(pred, current_price)
            elif doc["status"] == "closed" and doc.get("exit_price"):
                pred["current_price"] = doc["exit_price"]
                pred = _compute_pnl(pred, doc["exit_price"])

            # Time elapsed
            try:
                created = datetime.fromisoformat(doc["created_at"])
                elapsed = datetime.now() - created
                pred["time_elapsed_seconds"] = int(elapsed.total_seconds())
                pred["time_elapsed_display"] = _format_elapsed(elapsed)
            except Exception:
                pred["time_elapsed_seconds"] = 0
                pred["time_elapsed_display"] = "just now"

            predictions.append(pred)

        # Summary stats
        total = len(predictions)
        resolved = [p for p in predictions if p.get("was_correct") is not None]
        correct = [p for p in resolved if p["was_correct"]]
        total_pnl = sum(p.get("pnl_amount", 0) for p in predictions)
        accuracy = (len(correct) / len(resolved) * 100) if resolved else 0

        return {
            "predictions": predictions,
            "summary": {
                "total_predictions": total,
                "open_predictions": len([p for p in predictions if p["status"] == "open"]),
                "closed_predictions": len([p for p in predictions if p["status"] == "closed"]),
                "accuracy_percent": round(accuracy, 1),
                "correct_count": len(correct),
                "wrong_count": len(resolved) - len(correct),
                "total_pnl": round(total_pnl, 2),
            },
        }
    finally:
        await redis_client.close()


@router.post("/predictions/{prediction_id}/close")
async def close_prediction(prediction_id: str, req: PredictionCloseRequest):
    """Close a prediction, locking in the final exit price and P&L."""
    db = get_database()

    try:
        obj_id = ObjectId(prediction_id)
    except Exception:
        raise HTTPException(400, "Invalid prediction ID")

    doc = await db.ai_predictions.find_one({"_id": obj_id})
    if not doc:
        raise HTTPException(404, "Prediction not found")
    if doc["status"] == "closed":
        raise HTTPException(400, "Prediction is already closed")

    result_data = _compute_pnl(
        {"decision": doc["decision"], "entry_price": doc["entry_price"]},
        req.exit_price,
    )

    await db.ai_predictions.update_one(
        {"_id": obj_id},
        {"$set": {
            "status": "closed",
            "exit_price": req.exit_price,
            "closed_at": datetime.now().isoformat(),
            "final_pnl_amount": result_data["pnl_amount"],
            "final_pnl_percent": result_data["pnl_percent"],
            "final_was_correct": result_data["was_correct"],
        }},
    )

    return {
        "status": "success",
        "message": f"Closed {doc['decision']} on {doc['ticker']}",
        "pnl_amount": result_data["pnl_amount"],
        "pnl_percent": result_data["pnl_percent"],
        "was_correct": result_data["was_correct"],
    }


def _compute_pnl(pred: dict, current_price: float) -> dict:
    """Compute P&L based on decision direction."""
    entry = pred["entry_price"]
    decision = pred["decision"]

    if decision == "BUY":
        pnl = current_price - entry
        was_correct = current_price > entry
    elif decision == "SELL":
        pnl = entry - current_price
        was_correct = current_price < entry
    else:
        pnl = 0
        was_correct = None

    pnl_percent = (pnl / entry * 100) if entry != 0 else 0

    pred["pnl_amount"] = round(pnl, 2)
    pred["pnl_percent"] = round(pnl_percent, 2)
    pred["was_correct"] = was_correct

    return pred


def _format_elapsed(delta) -> str:
    """Format a timedelta into a human-readable string."""
    total_seconds = int(delta.total_seconds())
    if total_seconds < 60:
        return f"{total_seconds}s ago"
    elif total_seconds < 3600:
        return f"{total_seconds // 60}m ago"
    elif total_seconds < 86400:
        return f"{total_seconds // 3600}h ago"
    else:
        return f"{total_seconds // 86400}d ago"
