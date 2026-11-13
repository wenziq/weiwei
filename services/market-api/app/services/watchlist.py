from typing import Dict, List, Optional


class WatchlistService:
    def __init__(self, provider, store):
        self.provider = provider
        self.store = store

    @staticmethod
    def with_user_tags(instrument: Dict, document: Dict) -> Dict:
        tags = document["tagsByInstrument"].get(instrument["id"])
        return {**instrument, "tags": tags if tags is not None else instrument["tags"]}

    @staticmethod
    def all_ids_from(document):
        legacy_ids = [instrument_id for ids in document.get("groupMembers", {}).values() for instrument_id in ids]
        removed = set(document.get("removedInstruments", []))
        ids = list(dict.fromkeys([*document.get("watchlistIds", []), *legacy_ids]))
        return [item for item in ids if item not in removed]

    def all_ids(self):
        return self.all_ids_from(self.store.read("watchlist"))

    def list(self, query: Optional[str], tags: Optional[str], tag_mode: str) -> Dict:
        document = self.store.read("watchlist")
        ids = self.all_ids_from(document)
        stocks = [self.with_user_tags(item, document) for item in self.provider.get_instruments(ids)]
        all_tags = sorted({tag for stock in stocks for tag in stock["tags"]})
        if query:
            normalized = query.lower()
            stocks = [item for item in stocks if normalized in f"{item['name']}{item['code']}".lower()]
        selected_tags = {tag.strip() for tag in (tags or "").split(",") if tag.strip()}
        if selected_tags:
            def matches(item):
                own = set(item["tags"])
                return selected_tags.issubset(own) if tag_mode == "all" else bool(selected_tags.intersection(own))
            stocks = [item for item in stocks if matches(item)]
        return {"stocks": stocks, "tags": all_tags, "quotesRefreshing": self.provider.quotes_refreshing(ids)}

    def set_tags(self, instrument_id: str, tags: List[str]) -> Dict:
        instrument = self.provider.get_instrument(instrument_id)
        if not instrument:
            raise KeyError(instrument_id)
        cleaned = list(dict.fromkeys(tag.strip()[:20] for tag in tags if tag.strip()))
        def update(document):
            document["tagsByInstrument"][instrument_id] = cleaned
        self.store.update("watchlist", update)
        return {**instrument, "tags": cleaned}

    def add(self, instrument_id: str) -> Dict:
        instrument = self.provider.get_instrument(instrument_id)
        if not instrument:
            raise KeyError(instrument_id)
        def update(document):
            ids = self.all_ids_from(document)
            if instrument_id not in ids and instrument_id not in document["tagsByInstrument"]:
                document["tagsByInstrument"][instrument_id] = []
            document["watchlistIds"] = [*ids, instrument_id] if instrument_id not in ids else ids
            document["removedInstruments"] = [item for item in document.get("removedInstruments", []) if item != instrument_id]
            document.pop("groupMembers", None)
            document.pop("deletedGroups", None)
        self.store.update("watchlist", update)
        return self.with_user_tags(instrument, self.store.read("watchlist"))

    def remove(self, instrument_id: str) -> Dict:
        def update(document):
            ids = [item for item in self.all_ids_from(document) if item != instrument_id]
            document["watchlistIds"] = ids
            document["removedInstruments"] = list(dict.fromkeys([*document.get("removedInstruments", []), instrument_id]))
            document.pop("groupMembers", None)
            document.pop("deletedGroups", None)
        self.store.update("watchlist", update)
        return {"removed": True, "id": instrument_id}
