from datetime import datetime, timezone


class ResearchService:
    def __init__(self, store, provider):
        self.store = store
        self.provider = provider

    def list(self):
        documents = self.store.read("research")["documents"]
        return sorted(documents, key=lambda item: item["updatedAt"], reverse=True)

    def get(self, document_id: str):
        document = next((item for item in self.list() if item["id"] == document_id), None)
        if not document:
            raise KeyError(document_id)
        return document

    def create(self, document_id: str):
        existing = next((item for item in self.list() if item["id"] == document_id), None)
        if existing:
            return existing
        instrument = self.provider.get_instrument(document_id)
        if not instrument:
            raise KeyError(document_id)
        document = {
            "id": document_id,
            "instrumentId": document_id,
            "title": f"{instrument['name']} · 研究档案",
            "status": "未研究",
            "attitude": "未设态度",
            "tags": instrument["tags"],
            "completedAt": None,
            "reviewAt": None,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "contentMarkdown": "### 一、公司概况\n\n待补充。\n\n### 二、战略与历史\n\n待补充。\n\n### 三、竞争格局\n\n待补充。\n\n### 四、风险与结论\n\n待补充。",
        }
        def update(store_document):
            store_document["documents"].append(document)
            return document
        return self.store.update("research", update)

    @staticmethod
    def apply(item, values):
        if all(item.get(key) == value for key, value in values.items()):
            return item
        previous = {key: item.get(key) for key in ["contentMarkdown", "tags", "status", "attitude", "completedAt", "reviewAt", "updatedAt"]}
        item.setdefault("history", []).append(previous)
        item["history"] = item["history"][-20:]
        item.update(values)
        item["updatedAt"] = datetime.now(timezone.utc).isoformat()
        return item

    def update(self, document_id: str, payload):
        self.get(document_id)
        values = {"contentMarkdown": payload.content_markdown, "tags": payload.tags, "status": payload.status, "attitude": payload.attitude}
        def update(document):
            for item in document["documents"]:
                if item["id"] == document_id:
                    return self.apply(item, values)
            raise KeyError(document_id)
        return self.store.update("research", update)

    def update_metadata(self, document_id: str, payload):
        self.get(document_id)
        def update(document):
            for item in document["documents"]:
                if item["id"] == document_id:
                    return self.apply(item, payload.model_dump(by_alias=True))
            raise KeyError(document_id)
        return self.store.update("research", update)

    def delete(self, document_id: str):
        self.get(document_id)
        def update(document):
            document["documents"] = [item for item in document["documents"] if item["id"] != document_id]
            return {"deleted": True, "id": document_id}
        return self.store.update("research", update)
