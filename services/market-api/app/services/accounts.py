import csv
import math
import re
from datetime import datetime, timezone
from io import StringIO
from uuid import uuid4

from ..models.transaction import TransactionInput
from .accounting import AccountCalculator


HEADER_ALIASES = {
    "date": {"日期", "交易日期", "成交日期", "时间", "日期时间", "date", "datetime"},
    "type": {"类型", "交易类型", "操作", "type"},
    "stock": {"股票", "股票名称", "股票代码", "证券名称", "证券代码", "标的", "instrument", "instrumentid", "symbol", "code"},
    "quantity": {"数量", "成交数量", "股数", "quantity", "qty", "shares"},
    "price": {"成交价", "成交价格", "价格", "成交均价", "price"},
    "amount": {"金额", "成交金额", "发生金额", "amount"},
    "fee": {"费用", "手续费", "佣金", "fee", "commission"},
    "note": {"备注", "说明", "note", "comment"},
}
TYPE_ALIASES = {
    "买入": "buy", "买进": "buy", "买": "buy", "buy": "buy",
    "卖出": "sell", "卖": "sell", "sell": "sell",
    "资金转入": "deposit", "转入": "deposit", "入金": "deposit", "充值": "deposit", "deposit": "deposit",
    "资金转出": "withdraw", "转出": "withdraw", "出金": "withdraw", "提现": "withdraw", "withdraw": "withdraw",
}
DEMO_DEFAULTS = {
    "cmb": {"type": "实盘账户", "currency": "CNY", "description": "A 股实盘账户 · 移动加权成本", "start": "2026-01-01", "initial": 800000, "commission": 2.5, "minFee": 5, "stamp": 5, "fill": "手动填写价格", "members": [], "records": 126, "archived": False},
    "global": {"type": "实盘账户", "currency": "CNY", "description": "港股、美股实盘账户 · 支持多币种", "start": "2026-01-01", "initial": 300000, "commission": 3, "minFee": 15, "stamp": 5, "fill": "手动填写价格", "members": [], "records": 48, "archived": False},
    "sim": {"type": "模拟盘", "currency": "CNY", "description": "高股息策略验证 · 独立统计", "start": "2026-02-01", "initial": 500000, "commission": 0, "minFee": 0, "stamp": 0, "fill": "录入时实时价格", "members": [], "records": 32, "archived": False},
}


def normalize_header(value):
    return "".join(value.strip().lstrip("\ufeff").lower().split())


def parse_number(value, label):
    if value is None or not str(value).strip():
        return None
    text = str(value).strip().translate(str.maketrans("０１２３４５６７８９．－", "0123456789.-"))
    negative = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    text = re.sub(r"\s|人民币|港币|美元|HK\$|CN¥|¥|￥|\$|元|股", "", text, flags=re.IGNORECASE)
    if "," in text:
        if not re.fullmatch(r"[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?", text):
            raise ValueError(f"{label}的数字格式无法识别：{value}")
        text = text.replace(",", "")
    try:
        number = float(text)
    except ValueError as error:
        raise ValueError(f"{label}不是有效数字：{value}") from error
    if not math.isfinite(number):
        raise ValueError(f"{label}不能是无限值")
    return -number if negative else number


def parse_date(value):
    text = str(value or "").strip().replace("年", "-").replace("月", "-").replace("日", "")
    text = re.sub(r"[/.]", "-", text)
    if re.fullmatch(r"\d{8}", text):
        text = f"{text[:4]}-{text[4:6]}-{text[6:]}"
    parts = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(.*)", text)
    if parts:
        text = f"{parts[1]}-{int(parts[2]):02d}-{int(parts[3]):02d}{parts[4]}"
    try:
        return datetime.fromisoformat(text).isoformat()
    except ValueError as error:
        raise ValueError(f"日期格式无法识别：{value}；可使用 2026-01-31 或 2026-01-31 14:30") from error


class AccountService:
    def __init__(self, store, provider):
        self.store = store
        self.provider = provider
        self.resolve_instrument = provider.resolve_instrument
        self.calculator = AccountCalculator(provider)
        self.migrate_legacy_data()

    def migrate_legacy_data(self):
        document = self.store.read("accounts")
        changed = False
        for account in document["accounts"]:
            defaults = DEMO_DEFAULTS.get(account["id"])
            if defaults and not account.get("transactions") and all(account.get(key) == value for key, value in defaults.items() if key != "archived"):
                account["initial"] = 0
                account["records"] = 0
                changed = True
            if account.pop("archived", None) is not None:
                changed = True
        if changed:
            self.store.write("accounts", document)

    def list(self):
        result = []
        for item in self.store.read("accounts")["accounts"]:
            account = {key: value for key, value in item.items() if key != "archived"}
            account["records"] = len(item.get("transactions", []))
            result.append(account)
        return result

    def get(self, account_id: str):
        account = next((item for item in self.list() if item["id"] == account_id), None)
        if not account:
            raise KeyError(account_id)
        return account

    def create(self, payload):
        account = payload.model_dump()
        account.update({
            "id": uuid4().hex[:12], "commission": 2.5, "minFee": 5,
            "stamp": 5, "fill": "手动填写价格", "records": 0,
            "start": datetime.now(timezone.utc).date().isoformat(),
        })
        def update(document):
            document["accounts"].append(account)
            return account
        return self.store.update("accounts", update)

    def update(self, account_id: str, payload):
        self.get(account_id)
        def update(document):
            for account in document["accounts"]:
                if account["id"] == account_id:
                    for key, value in payload.model_dump(exclude_unset=True).items():
                        account[key] = value
                    return account
            raise KeyError(account_id)
        return self.store.update("accounts", update)

    def delete(self, account_id: str):
        account = self.get(account_id)
        def update(document):
            document["accounts"] = [item for item in document["accounts"] if item["id"] != account_id]
            for item in document["accounts"]:
                item["members"] = [member for member in item.get("members", []) if member != account_id]
            return {"deleted": True, "id": account_id, "records": account["records"]}
        return self.store.update("accounts", update)

    def transactions(self, account_id: str):
        accounts = self.calculator.select_accounts(self.list(), account_id)
        return [item for account in accounts for item in account.get("transactions", [])]

    def build_transaction(self, account, payload):
        if account["type"] == "汇总账户":
            raise ValueError("汇总账户不能直接记账，请选择实盘账户或模拟盘")
        data = payload.model_dump(by_alias=True)
        if data["type"] in {"buy", "sell"}:
            if not data.get("instrumentId") or not data.get("quantity") or not data.get("price"):
                raise ValueError("买卖记录必须包含股票、正数数量和正数成交价")
            if data["quantity"] <= 0 or data["price"] <= 0:
                raise ValueError("数量和成交价必须大于零")
            instrument_id = self.resolve_instrument(data["instrumentId"])
            if not instrument_id:
                raise ValueError(f"找不到股票 {data['instrumentId']}，请从全市场目录中选择")
            data["instrumentId"] = instrument_id
            gross = data["quantity"] * data["price"]
            data["amount"] = round(gross + data["fee"] if data["type"] == "buy" else gross - data["fee"], 2)
        elif not data.get("amount") or data["amount"] <= 0:
            raise ValueError("资金转入转出必须包含大于零的金额")
        if data["fee"] < 0:
            raise ValueError("费用不能为负数")
        datetime.fromisoformat(data["date"].replace("Z", "+00:00"))
        data.update({"id": uuid4().hex[:12], "accountId": account["id"], "createdAt": datetime.now(timezone.utc).isoformat()})
        return data

    def create_transaction(self, account_id: str, payload):
        account = self.get(account_id)
        data = self.build_transaction(account, payload)
        def update(document):
            for item in document["accounts"]:
                if item["id"] == account_id:
                    item.setdefault("transactions", []).append(data)
                    item["records"] = len(item["transactions"])
                    return data
            raise KeyError(account_id)
        return self.store.update("accounts", update)

    def import_transactions(self, account_id: str, content: str):
        account = self.get(account_id)
        text = content.lstrip("\ufeff")
        try:
            dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(StringIO(text), dialect=dialect)
        if not reader.fieldnames:
            raise ValueError("CSV 缺少表头")
        fields = {}
        for original in reader.fieldnames:
            normalized = normalize_header(original or "")
            target = next((key for key, aliases in HEADER_ALIASES.items() if normalized in {normalize_header(alias) for alias in aliases}), None)
            if target and target not in fields:
                fields[target] = original
        if not {"date", "type"}.issubset(fields):
            raise ValueError("找不到日期和类型列；支持“日期 / 交易日期 / date”和“类型 / 操作 / type”等列名")
        records = []
        for row in reader:
            if not any(str(value or "").strip() for value in row.values()):
                continue
            try:
                kind = TYPE_ALIASES.get(normalize_header(row.get(fields["type"]) or ""), normalize_header(row.get(fields["type"]) or ""))
                is_trade = kind in {"buy", "sell"}
                quantity = parse_number(row.get(fields["quantity"]), "数量") if "quantity" in fields else None
                price = parse_number(row.get(fields["price"]), "成交价") if "price" in fields else None
                amount = parse_number(row.get(fields["amount"]), "金额") if "amount" in fields else None
                if is_trade and price is None and amount is not None and quantity:
                    price = abs(amount) / quantity
                elif is_trade and quantity is None and amount is not None and price:
                    quantity = abs(amount) / price
                payload = TransactionInput.model_validate({
                    "type": kind, "date": parse_date(row.get(fields["date"])),
                    "fee": parse_number(row.get(fields["fee"]), "费用") or 0 if "fee" in fields else 0,
                    "note": (row.get(fields["note"]) or "").strip() if "note" in fields else "",
                    "instrumentId": (row.get(fields["stock"]) or "").strip() if is_trade and "stock" in fields else None,
                    "quantity": quantity if is_trade else None,
                    "price": price if is_trade else None,
                    "amount": amount if not is_trade else None,
                })
                records.append(self.build_transaction(account, payload))
            except (ValueError, TypeError, csv.Error) as error:
                raise ValueError(f"第 {reader.line_num} 行导入失败：{error}") from error
        if not records:
            raise ValueError("CSV 没有可导入的交易记录")
        def update(document):
            for item in document["accounts"]:
                if item["id"] == account_id:
                    item.setdefault("transactions", []).extend(records)
                    item["records"] = len(item["transactions"])
                    return {"imported": len(records), "transactionIds": [record["id"] for record in records]}
            raise KeyError(account_id)
        return self.store.update("accounts", update)

    def summary(self, account_id="all"):
        return self.calculator.calculate(self.list(), account_id)
