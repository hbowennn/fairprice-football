import os
from datetime import datetime, timezone
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FairPrice Football API", version="2.0.0",
 description="Optional fixtures helper. Odds modelling is performed locally in the frontend.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def root():
    return {"service":"fairprice-football","version":"2.0.0","betfair_required":False}

@app.get("/health")
def health():
    return {"ok":True,"service":"fairprice-football","betfair_required":False,
            "football_data_configured":bool(os.getenv("FOOTBALL_DATA_TOKEN"))}

@app.get("/fixtures/{competition}")
async def fixtures(competition: str):
    token=os.getenv("FOOTBALL_DATA_TOKEN","").strip()
    if not token:
        raise HTTPException(status_code=503, detail="Optional FOOTBALL_DATA_TOKEN is not configured. You can still use manual modelling.")
    if not competition.replace("-","").isalnum():
        raise HTTPException(status_code=400, detail="Invalid competition code")
    url=f"https://api.football-data.org/v4/competitions/{competition}/matches"
    async with httpx.AsyncClient(timeout=15) as client:
        r=await client.get(url,headers={"X-Auth-Token":token},params={"status":"SCHEDULED"})
    if r.status_code>=400:
        raise HTTPException(status_code=r.status_code,detail=f"football-data.org returned HTTP {r.status_code}; check token and plan access")
    data=r.json()
    return {"competition":competition,"matches":[{"date":m.get("utcDate"),"home":m.get("homeTeam",{}).get("name"),"away":m.get("awayTeam",{}).get("name")} for m in data.get("matches",[])[:20]]}
