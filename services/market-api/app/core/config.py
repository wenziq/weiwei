import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_name: str
    version: str
    provider: str
    data_dir: Path
    allow_demo_fallback: bool
    history_auto_start: bool
    history_interval_seconds: float
    history_markets: tuple[str, ...]
    http_min_interval_seconds: float
    cors_origins: tuple[str, ...]


ROOT_DIR = Path(__file__).resolve().parents[2]
settings = Settings(
    app_name="危微个人行情服务",
    version="0.6.0",
    provider="multi-source",
    data_dir=Path(os.getenv("WEIWEI_DATA_DIR", ROOT_DIR / "var")),
    allow_demo_fallback=os.getenv("WEIWEI_ALLOW_DEMO_FALLBACK", "0") == "1" or os.getenv("WEIWEI_MARKET_PROVIDER") == "demo",
    history_auto_start=os.getenv("WEIWEI_HISTORY_AUTO_START", "0") == "1",
    history_interval_seconds=float(os.getenv("WEIWEI_HISTORY_INTERVAL_SECONDS", "0.5")),
    history_markets=tuple(os.getenv("WEIWEI_HISTORY_MARKETS", "CN,HK,US").split(",")),
    http_min_interval_seconds=float(os.getenv("WEIWEI_HTTP_MIN_INTERVAL_SECONDS", "0.5")),
    cors_origins=tuple(part.strip() for part in os.getenv("WEIWEI_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174,tauri://localhost,http://tauri.localhost").split(",") if part.strip()),
)
