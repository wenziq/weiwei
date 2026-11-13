from fastapi import APIRouter

from .routes import accounts, ai, macro, market, research, screener, watchlist

api_router = APIRouter()
api_router.include_router(market.router, prefix="/market", tags=["market"])
api_router.include_router(watchlist.router, prefix="/watchlist", tags=["watchlist"])
api_router.include_router(research.router, prefix="/research", tags=["research"])
api_router.include_router(screener.router, prefix="/screener", tags=["screener"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(macro.router, prefix="/macro", tags=["macro"])
