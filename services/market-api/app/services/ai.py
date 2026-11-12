import json
import os
from urllib.parse import urlsplit

from ..providers.http import post_json
from ..models.screener import ScreenerRequest


class SystemSecretStore:
    service = "com.weiwei.desktop.ai"

    @staticmethod
    def account(provider, base_url):
        return f"{provider}:{base_url}"

    def get(self, provider, base_url):
        import keyring
        return keyring.get_password(self.service, self.account(provider, base_url))

    def set(self, provider, base_url, value):
        import keyring
        keyring.set_password(self.service, self.account(provider, base_url), value)

    def delete(self, provider, base_url):
        import keyring
        from keyring.errors import PasswordDeleteError
        try:
            keyring.delete_password(self.service, self.account(provider, base_url))
        except PasswordDeleteError:
            pass


class AIService:
    def __init__(self, store, secret_store=None):
        self.store = store
        self.secrets = secret_store or SystemSecretStore()

    def config(self):
        return self.store.read("settings")["ai"]

    @staticmethod
    def validate_url(url):
        parsed = urlsplit(url.strip().rstrip("/"))
        if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("AI 地址必须是有效的 HTTP(S) 地址，且不能包含账号密码")
        if parsed.scheme != "https" and parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("远程 AI 服务必须使用 HTTPS；本机测试地址可使用 HTTP")
        return url.strip().rstrip("/")

    def status(self):
        config = self.config()
        try:
            stored = self.secrets.get(config["provider"], config["baseUrl"])
        except Exception:
            stored = None
        return {**config, "configured": bool(stored or os.getenv("WEIWEI_AI_API_KEY")), "keySource": "keychain" if stored else "environment" if os.getenv("WEIWEI_AI_API_KEY") else None}

    def configure(self, payload, api_key):
        base_url = self.validate_url(payload.base_url)
        provider = payload.provider.strip()
        model = payload.model.strip()
        if not provider or not model:
            raise ValueError("AI 提供商和模型不能为空")
        def update(document):
            document["ai"] = {"provider": provider, "baseUrl": base_url, "model": model}
        self.store.update("settings", update)
        if api_key and api_key.strip():
            self.secrets.set(provider, base_url, api_key.strip())
        return self.status()

    def clear_key(self):
        config = self.config()
        self.secrets.delete(config["provider"], config["baseUrl"])
        return self.status()

    def request(self, user_content, document=None, history=None, system=None):
        config = self.config()
        try:
            api_key = self.secrets.get(config["provider"], config["baseUrl"]) or os.getenv("WEIWEI_AI_API_KEY")
        except Exception as error:
            raise RuntimeError(f"系统钥匙串不可用，请使用服务端环境变量 WEIWEI_AI_API_KEY: {error}") from error
        if not api_key:
            raise ValueError("尚未配置 AI API Key，请在设置中完成配置")
        context = ""
        if document:
            context = f"\n\n当前研究档案：{document['title']}\n研究正文：\n{document['contentMarkdown'][:30000]}"
        messages = [{"role": "system", "content": system or "你是危微个人投研助手。基于提供的资料回答，不编造数据，明确区分事实、假设和需要进一步验证的内容。" + context}]
        for item in (history or [])[-8:]:
            messages.append({"role": item.role, "content": item.content[:8000]})
        messages.append({"role": "user", "content": user_content[:8000]})
        endpoint = config["baseUrl"] if config["baseUrl"].endswith("/chat/completions") else config["baseUrl"] + "/chat/completions"
        payload = {"model": config["model"], "messages": messages, "stream": False, "temperature": 0.2}
        response = post_json(endpoint, payload, headers={"Authorization": f"Bearer {api_key}"}, timeout=60)
        choices = response.get("choices") or []
        content = choices[0].get("message", {}).get("content") if choices else None
        if not isinstance(content, str) or not content.strip():
            raise ValueError("AI 服务没有返回有效文本")
        return {"reply": content.strip(), "provider": config["provider"], "model": config["model"]}

    def chat(self, instrument_id, payload):
        document = next((item for item in self.store.read("research")["documents"] if item["instrumentId"] == instrument_id), None)
        if not document:
            raise KeyError(instrument_id)
        if not payload.message.strip():
            raise ValueError("请输入研究问题")
        return self.request(payload.message, document, payload.history)

    def parse_screener(self, query):
        system = "将用户选股描述转换为JSON：{\"conditions\":[{\"field\":\"dividend|cap|roe|net|debt|industry|concept|price|changePct|amount|turnover\",\"operator\":\"gte|lte|between|include|exclude\",\"value\":数值或文本或两个数值}] }。field只能用给定字段，between时value是两个数字，行业与概念用文本。只输出JSON，不执行筛选。"
        result = self.request(query, system=system)
        text = result["reply"].strip()
        if text.startswith("```"):
            text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(text)
        request = ScreenerRequest.model_validate(parsed)
        return {"conditions": [condition.model_dump() for condition in request.conditions], "provider": result["provider"], "model": result["model"]}
