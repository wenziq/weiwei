import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.router import api_router
from .container import history_collector, provider, refresh_scheduler
from .core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("app").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(_):
    refresh_scheduler.start()
    try:
        if settings.history_auto_start:
            history_collector.start()
        yield
    finally:
        history_collector.stop()
        refresh_scheduler.stop()


app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api/v1")


@app.exception_handler(KeyError)
async def not_found_handler(_, error):
    return JSONResponse(status_code=404, content={"detail": f"Resource not found: {error.args[0]}"})


@app.exception_handler(ValueError)
async def validation_handler(_, error):
    return JSONResponse(status_code=400, content={"detail": str(error)})


@app.get("/api/v1/health", tags=["system"])
def health():
    return {
        "status": "ok", "provider": provider.name, "version": settings.version,
        "demoFallback": settings.allow_demo_fallback, "history": history_collector.status(),
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/", include_in_schema=False)
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/api/v1/health"}
