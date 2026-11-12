from typing import Dict, List, Optional


GROUPS = {
    "全部账户 · 持仓": ["sz-300502", "sz-300308", "sh-600036", "hk-00700", "us-aapl", "sh-600519", "sz-300750"],
    "观察": ["sz-300502", "sz-300308", "sz-300394", "sh-688256", "sz-300124", "hk-00700", "us-aapl", "sh-600519", "sz-300750", "sz-002475", "sh-600900", "sz-002594"],
    "CPO 产业链": ["sz-300502", "sz-300308", "sz-300394"],
    "高股息": ["sh-600036", "sh-600519", "sh-600900", "sh-601088"],
    "已研究": ["sz-300502", "sz-300308", "sh-600036", "sz-300124", "sh-600519", "sh-601088"],
    "今日放量": ["sz-300502", "sz-300308", "sz-300394", "sh-688256"],
}
PROTECTED_GROUPS = {"全部账户 · 持仓", "观察"}


class WatchlistService:
    def __init__(self, provider, store):
        self.provider = provider
        self.store = store

    def with_user_tags(self, instrument: Dict, document: Dict) -> Dict:
        tags = document["tagsByInstrument"].get(instrument["id"])
        return {**instrument, "tags": tags if tags is not None else instrument["tags"]}

    def groups(self, document=None):
        document = document or self.store.read("watchlist")
        custom = document.get("groupMembers", {})
        deleted = set(document.get("deletedGroups", []))
        return {name: custom.get(name, ids) for name, ids in {**GROUPS, **custom}.items() if name not in deleted}

    def all_ids(self):
        return list(dict.fromkeys(instrument_id for ids in self.groups().values() for instrument_id in ids))

    def create_group(self, name):
        cleaned = name.strip()
        if not cleaned or len(cleaned) > 24 or any(character in cleaned for character in "/\\"):
            raise ValueError("分组名称需为 1–24 个字符，且不能包含斜杠")
        def update(document):
            if cleaned in self.groups(document):
                raise ValueError("分组已存在")
            deleted = document.setdefault("deletedGroups", [])
            document["deletedGroups"] = [item for item in deleted if item != cleaned]
            document.setdefault("groupMembers", {})[cleaned] = []
        self.store.update("watchlist", update)
        return {"name": cleaned, "count": 0}

    def delete_group(self, name):
        if name in PROTECTED_GROUPS:
            raise ValueError("系统分组不能删除")
        def update(document):
            if name not in self.groups(document):
                raise KeyError(name)
            document["groupMembers"].pop(name, None)
            document["deletedGroups"] = list(dict.fromkeys([*document.get("deletedGroups", []), name]))
        self.store.update("watchlist", update)
        return {"deleted": True, "name": name}

    def list(self, group: Optional[str], query: Optional[str], tags: Optional[str], tag_mode: str) -> Dict:
        document = self.store.read("watchlist")
        selected_tags = {tag.strip() for tag in (tags or "").split(",") if tag.strip()}
        groups = self.groups(document)
        group_ids = groups.get(group or "全部账户 · 持仓", groups.get("观察", []))
        instruments = self.provider.get_instruments(group_ids)
        stocks = [self.with_user_tags(item, document) for item in instruments]
        if query:
            normalized = query.lower()
            stocks = [item for item in stocks if normalized in f"{item['name']}{item['code']}".lower()]
        if selected_tags:
            def matches(item):
                own = set(item["tags"])
                return selected_tags.issubset(own) if tag_mode == "all" else bool(selected_tags.intersection(own))
            stocks = [item for item in stocks if matches(item)]
        return {"stocks": stocks, "groups": [{"name": name, "count": len(ids)} for name, ids in groups.items()]}

    def set_tags(self, instrument_id: str, tags: List[str]) -> Dict:
        instrument = self.provider.get_instrument(instrument_id)
        if not instrument:
            raise KeyError(instrument_id)
        cleaned = list(dict.fromkeys(tag.strip()[:20] for tag in tags if tag.strip()))
        def update(document):
            document["tagsByInstrument"][instrument_id] = cleaned
        self.store.update("watchlist", update)
        return {**instrument, "tags": cleaned}

    def add_to_group(self, instrument_id: str, group: str) -> Dict:
        instrument = self.provider.get_instrument(instrument_id)
        if not instrument:
            raise KeyError(instrument_id)
        group = group.strip() or "观察"
        def update(document):
            if group in document.get("deletedGroups", []):
                raise ValueError("分组已删除，请先重新创建")
            members = document.setdefault("groupMembers", {})
            current = list(members.get(group, GROUPS.get(group, [])))
            if instrument_id not in current:
                current.append(instrument_id)
            members[group] = current
            return current
        self.store.update("watchlist", update)
        return instrument

    def remove_from_group(self, instrument_id: str, group: str) -> Dict:
        def update(document):
            members = document.setdefault("groupMembers", {})
            current = list(members.get(group, GROUPS.get(group, [])))
            members[group] = [item for item in current if item != instrument_id]
        self.store.update("watchlist", update)
        return {"removed": True, "id": instrument_id, "group": group}
