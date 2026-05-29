from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.analyze import router as analyze_router

app = FastAPI(
    title="Club Locator AI — Backend",
    description="Motor de análisis estratégico de ubicaciones para clubes de pádel",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to Lovable domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "service": "club-locator-ai-backend"}
