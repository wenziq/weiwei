import csv
from datetime import datetime, timezone
from io import StringIO
from uuid import uuid4

from ..models.transaction import TransactionInput


class AccountService:
    def __init__(self, store, resolve_instrument):
        self.store = store
        self.resolve_instrument = resolve_instrument

    def list(self):
        return self.store.read("accounts")["accounts"]

    def get(self, account_id: str):
        account = next((item for item in self.list() if item["id"] == account_id), None)
        if not account:
            raise KeyError(account_id)
        return account

    def create(self, payload):
        account = payload.model_dump()
        account.update({
            "id": uuid4().hex[:12], "commission": 2.5, "minFee": 5,
            "stamp": 5, "fill": "手动填写价格", "records": 0, "archived": False,
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

    def transactions(self, account_id: str):
        if account_id == "all":
            return [item for account in self.list() for item in account.get("transactions", [])]
        return self.get(account_id).get("transactions", [])

    def build_transaction(self, account, payload):
        if account["type"] == "汇总账户" or account["archived"]:
            raise ValueError("请选择可记账的实盘账户或模拟盘；汇总账户和已归档账户不能记账")
        data = payload.model_dump()
        if data["type"] in {"buy", "sell"}:
            if not data.get("instrument_id") or not data.get("quantity") or not data.get("price"):
                raise ValueError("买卖记录必须包含股票、正数数量和正数成交价")
            if data["quantity"] <= 0 or data["price"] <= 0:
                raise ValueError("数量和成交价必须大于零")
            instrument_id = self.resolve_instrument(data["instrument_id"])
            if not instrument_id:
                raise ValueError(f"找不到股票 {data['instrument_id']}，请从全市场目录中选择")
            data["instrument_id"] = instrument_id
            data["amount"] = round(data["quantity"] * data["price"] + data["fee"], 2)
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
                    item["records"] += 1
                    return data
            raise KeyError(account_id)
        return self.store.update("accounts", update)

    def import_transactions(self, account_id: str, content: str):
        account = self.get(account_id)
        reader = csv.DictReader(StringIO(content.lstrip("\ufeff")))
        if not reader.fieldnames or not {"日期", "类型"}.issubset(reader.fieldnames):
            raise ValueError("CSV 必须包含“日期、类型”列；股票交易还需要“股票、数量、成交价”")
        records = []
        types = {"买入": "buy", "卖出": "sell", "资金转入": "deposit", "资金转出": "withdraw", "转入": "deposit", "转出": "withdraw"}
        for row in reader:
            try:
                date = datetime.fromisoformat((row.get("日期") or "").strip().replace("/", "-")).isoformat()
                kind = types.get((row.get("类型") or "").strip(), (row.get("类型") or "").strip())
                is_trade = kind in {"buy", "sell"}
                payload = TransactionInput.model_validate({
                    "type": kind, "date": date, "fee": float(row.get("费用") or 0), "note": row.get("备注") or "",
                    "instrumentId": row.get("股票") if is_trade else None,
                    "quantity": float(row.get("数量") or 0) if is_trade else None,
                    "price": float(row.get("成交价") or 0) if is_trade else None,
                    "amount": float(row.get("金额") or 0) if not is_trade else None,
                })
                records.append(self.build_transaction(account, payload))
            except (ValueError, TypeError) as error:
                raise ValueError(f"第 {reader.line_num} 行导入失败：{error}") from error
        if not records:
            raise ValueError("CSV 没有可导入的交易记录")
        def update(document):
            for item in document["accounts"]:
                if item["id"] == account_id:
                    item.setdefault("transactions", []).extend(records)
                    item["records"] += len(records)
                    return {"imported": len(records), "transactionIds": [record["id"] for record in records]}
            raise KeyError(account_id)
        return self.store.update("accounts", update)

    def summary(self, account_id="all"):
        summaries = {
            "cmb": {"totalAssets": 879768.26, "cash": 162100.20, "marketValue": 717668.06, "dayPnl": 6218.42, "totalPnl": 142680.20, "timeWeightedReturn": 21.26, "xirr": 18.42, "maxDrawdown": -7.86, "benchmarkReturn": 9.26},
            "global": {"totalAssets": 406662.26, "cash": 38121.92, "marketValue": 368540.34, "dayPnl": 2423.89, "totalPnl": 43739.98, "timeWeightedReturn": 12.06, "xirr": 10.88, "maxDrawdown": -9.14, "benchmarkReturn": 9.26},
            "sim": {"totalAssets": 541300.00, "cash": 82100.00, "marketValue": 459200.00, "dayPnl": 1268.00, "totalPnl": 41300.00, "timeWeightedReturn": 8.26, "xirr": 7.92, "maxDrawdown": -3.18, "benchmarkReturn": 9.26},
        }
        if account_id in summaries:
            return summaries[account_id]
        return {
            "totalAssets": 1286430.52, "cash": 200222.12, "marketValue": 1086208.40,
            "dayPnl": 8642.31, "totalPnl": 186420.18, "timeWeightedReturn": 18.42,
            "xirr": 15.76, "maxDrawdown": -8.32, "benchmarkReturn": 9.26,
        }
