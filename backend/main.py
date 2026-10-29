import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(title="FairPrice Football API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
API_BASE = "https://v3.football.api-sports.io"

@app.get("/")
def root():
    return {"service":"fairprice-football", "version":"3.0.0", "player_data":"API-Football"}

@app.get("/health")
def health():
    return {"ok":True, "service":"fairprice-football", "api_football_configured":bool(os.getenv("API_FOOTBALL_KEY", "").strip())}

async def api_get(path: str, params: dict):
    key = os.getenv("API_FOOTBALL_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="API_FOOTBALL_KEY is missing in Render Environment settings.")
    async with httpx.AsyncClient(timeout=25) as client:
        try:
            r = await client.get(f"{API_BASE}{path}", headers={"x-apisports-key": key}, params=params)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Could not reach API-Football: {e}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"API-Football returned HTTP {r.status_code}. Check your key, quota and plan access.")
    data = r.json()
    errors = data.get("errors")
    if errors:
        raise HTTPException(status_code=400, detail=f"API-Football: {errors}")
    return data

@app.get("/api/teams/search")
async def search_teams(query: str = Query(min_length=2, max_length=80)):
    data = await api_get("/teams", {"search": query})
    return {"teams":[{"id":x.get("team",{}).get("id"), "name":x.get("team",{}).get("name"), "country":x.get("team",{}).get("country"), "logo":x.get("team",{}).get("logo"), "venue":x.get("venue",{}).get("name")} for x in data.get("response", [])[:15]]}

@app.get("/api/teams/{team_id}/players")
async def team_players(team_id: int, season: int = Query(default=2026, ge=2010, le=2035)):
    # Squad gives a complete roster; season stats supply minutes, goals and shot rates.
    squad_data = await api_get("/players/squads", {"team": team_id})
    squad_rows = squad_data.get("response", [])
    if not squad_rows:
        raise HTTPException(status_code=404, detail="No squad returned for this team.")
    squad = squad_rows[0].get("players", [])
    stats_data = await api_get("/players", {"team": team_id, "season": season, "page": 1})
    stats_rows = stats_data.get("response", [])
    # Some leagues return many players. Page through up to five pages within the free API request budget.
    paging = stats_data.get("paging", {})
    pages = min(int(paging.get("total", 1) or 1), 5)
    for page in range(2, pages + 1):
        more = await api_get("/players", {"team": team_id, "season": season, "page": page})
        stats_rows.extend(more.get("response", []))
    by_id = {}
    for row in stats_rows:
        p = row.get("player", {})
        stat = (row.get("statistics") or [{}])[0]
        games = stat.get("games") or {}; goals = stat.get("goals") or {}; shots = stat.get("shots") or {}
        minutes = float(games.get("minutes") or 0)
        appearances = int(games.get("appearences") or games.get("appearances") or 0)
        lineups = int(games.get("lineups") or 0)
        by_id[p.get("id")] = {
            "minutes": minutes, "appearances": appearances, "lineups": lineups,
            "goals": float(goals.get("total") or 0), "shots": float(shots.get("total") or 0),
            "shots_on_target": float(shots.get("on") or 0),
            "goals_per90": (float(goals.get("total") or 0) * 90 / minutes) if minutes else 0,
            "shots_per90": (float(shots.get("total") or 0) * 90 / minutes) if minutes else 0,
            "sot_per90": (float(shots.get("on") or 0) * 90 / minutes) if minutes else 0,
            "start_rate": (lineups / appearances * 100) if appearances else 50,
        }
    players = []
    for p in squad:
        pid = p.get("id")
        stat = by_id.get(pid, {})
        players.append({"id":pid, "name":p.get("name"), "age":p.get("age"), "number":p.get("number"), "position":p.get("position"), "photo":p.get("photo"), **stat})
    return {"team_id":team_id, "season":season, "players":players, "stats_note":"Rates are derived from available season statistics. Missing stats are returned as zero; verify coverage for your league and plan."}
