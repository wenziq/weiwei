from .core.config import ROOT_DIR, settings
from .providers.composite import CompositeMarketDataProvider
from .repositories.json_store import JsonDocumentStore
from .services.accounts import AccountService
from .services.ai import AIService
from .services.candles import CandleService
from .services.history import HistoryCollector
from .services.refresh import RefreshScheduler
from .services.research import ResearchService
from .services.screener import ScreenerService
from .services.screener_data import ScreenerDataCollector
from .services.watchlist import WatchlistService

provider = CompositeMarketDataProvider(settings.data_dir)
store = JsonDocumentStore(settings.data_dir, ROOT_DIR / "app" / "data" / "user_seed.json")
watchlist_service = WatchlistService(provider, store)
provider.priority_ids = watchlist_service.all_ids
research_service = ResearchService(store, provider)
provider.research_documents = research_service.list
screener_data_collector = ScreenerDataCollector(provider)
screener_service = ScreenerService(provider, screener_data_collector)
account_service = AccountService(store, provider.resolve_instrument)
history_collector = HistoryCollector(provider)
refresh_scheduler = RefreshScheduler(history_collector)
provider.candle_service = CandleService(provider, refresh_scheduler)
ai_service = AIService(store)
