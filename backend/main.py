import os
import time
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FairPrice Football API", version="0.1.0")

# In production, replace "*" with your deployed frontend origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

BETFAIR_APP_KEY = os.getenv("BETFAIR_APP_KEY", "")
BETFAIR_SESSION_TOKEN = os.getenv("BETFAIR_SESSION_TOKEN", "")
BETFAIR_API = "https://api.betfair.com/exchange/betting/json-rpc/v1"

def configured() -> bool:
    return bool(BETFAIR_APP_KEY and BETFAIR_SESSION_TOKEN)

async def betfair_rpc(method: str, params: dict[str, Any]) -> Any:
    if not configured():
        raise HTTPException(
            status_code=503,
            detail="Betfair credentials are not configured. Add BETFAIR_APP_KEY and BETFAIR_SESSION_TOKEN as backend secrets."
        )
    payload = [{"jsonrpc": "2.0", "method": f"SportsAPING/v1.0/{method}", "params": params, "id": 1}]
    headers = {
        "X-Application": BETFAIR_APP_KEY,
        "X-Authentication": BETFAIR_SESSION_TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=18) as client:
            response = await client.post(BETFAIR_API, headers=headers, json=payload)
        if response.status_code in (401, 403):
            raise HTTPException(status_code=502, detail="Betfair rejected the session or application key. Refresh the session token and check API access.")
        response.raise_for_status()
        body = response.json()
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Betfair API: {type(exc).__name__}")
    item = body[0] if isinstance(body, list) and body else {}
    if item.get("error"):
        raise HTTPException(status_code=502, detail="Betfair API returned an error. Check the configured session, key and market request.")
    return item.get("result", [])

@app.get("/health")
async def health():
    return {"ok": True, "service": "fairprice-football", "betfair_configured": configured(), "timestamp": int(time.time())}

@app.get("/football/events")
async def football_events(text: str = Query(default="", max_length=120), max_results: int = Query(default=100, ge=1, le=200)):
    params = {
        "filter": {
            "eventTypeIds": ["1"],
            "marketStartTime": {"from": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
            "textQuery": text or None,
        },
        "maxResults": str(max_results),
        "marketProjection": ["COMPETITION", "EVENT", "MARKET_START_TIME"],
        "sort": "FIRST_TO_START",
    }
    # Remove null filter members; Betfair's API does not need an empty text query.
    if not text:
        params["filter"].pop("textQuery", None)
    result = await betfair_rpc("listMarketCatalogue", params)
    # listMarketCatalogue returns markets, not unique events; collapse to one event per ID.
    events = {}
    for market in result:
        event = market.get("event") or {}
        event_id = str(event.get("id", ""))
        if not event_id:
            continue
        comp = market.get("competition") or {}
        events[event_id] = {
            "id": event_id,
            "name": event.get("name", "Unknown event"),
            "openDate": event.get("openDate", ""),
            "competition": comp.get("name", ""),
        }
    return {"events": list(events.values())}

@app.get("/football/markets")
async def football_markets(event_id: str = "", text: str = "", max_results: int = Query(default=200, ge=1, le=500)):
    filt: dict[str, Any] = {"eventTypeIds": ["1"]}
    if event_id:
        filt["eventIds"] = [event_id]
    if text:
        filt["textQuery"] = text
    params = {
        "filter": filt,
        "maxResults": str(max_results),
        "marketProjection": ["EVENT", "COMPETITION", "MARKET_START_TIME", "RUNNER_DESCRIPTION"],
        "sort": "FIRST_TO_START",
    }
    catalogue = await betfair_rpc("listMarketCatalogue", params)
    market_ids = [m.get("marketId") for m in catalogue if m.get("marketId")]
    books = []
    if market_ids:
        books = await betfair_rpc("listMarketBook", {
            "marketIds": market_ids[:200],
            "priceProjection": {"priceData": ["EX_BEST_OFFERS"]},
        })
    book_by_id = {b.get("marketId"): b for b in books}
    out = []
    for market in catalogue:
        mid = market.get("marketId")
        book = book_by_id.get(mid, {})
        runners_book = {str(r.get("selectionId")): r for r in book.get("runners", [])}
        runners = []
        for runner in market.get("runners", []):
            rb = runners_book.get(str(runner.get("selectionId")), {})
            ex = rb.get("ex", {})
            backs = ex.get("availableToBack", [])
            lays = ex.get("availableToLay", [])
            runners.append({
                "selectionId": runner.get("selectionId"),
                "name": runner.get("runnerName", ""),
                "status": rb.get("status", ""),
                "bestBack": backs[0].get("price") if backs else None,
                "bestBackSize": backs[0].get("size") if backs else None,
                "bestLay": lays[0].get("price") if lays else None,
                "bestLaySize": lays[0].get("size") if lays else None,
            })
        event = market.get("event") or {}
        out.append({
            "marketId": mid,
            "marketName": market.get("marketName", ""),
            "marketType": market.get("description", {}).get("marketType", ""),
            "eventId": event.get("id", ""),
            "eventName": event.get("name", ""),
            "marketStartTime": market.get("marketStartTime", ""),
            "status": book.get("status", ""),
            "inplay": book.get("inplay", False),
            "totalMatched": book.get("totalMatched"),
            "runners": runners,
        })
    return {"markets": out}

@app.get("/football/market-types")
async def market_types():
    # Informational helper; market availability varies by event and competition.
    return {"supported_concepts": [
        {"marketType": "MATCH_ODDS", "label": "90-minute match odds"},
        {"marketType": "OVER_UNDER_25", "label": "Over/Under 2.5 goals"},
        {"marketType": "CORRECT_SCORE", "label": "Correct score"},
        {"marketType": "PLAYER_PROP", "label": "Player markets vary; inspect returned market catalogue"},
    ], "note": "This list is descriptive, not a guarantee those markets are offered for every event."}
