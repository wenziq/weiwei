from bisect import bisect_right
from datetime import datetime, timezone


def transaction_time(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed


class AccountCalculator:
    def __init__(self, provider):
        self.provider = provider

    def calculate(self, accounts, account_id):
        selected = self.select_accounts(accounts, account_id)
        if not selected:
            existing = next((item for item in accounts if item["id"] == account_id), None)
            if account_id == "all" or existing and existing["type"] == "汇总账户":
                return {
                    "accountId": account_id, "currency": existing["currency"] if existing else "CNY",
                    "totalAssets": 0, "cash": 0, "marketValue": 0, "dayPnl": 0,
                    "totalPnl": 0, "totalReturn": None, "unrealizedPnl": 0, "realizedPnl": 0,
                    "positions": [], "curve": [], "warnings": [],
                }
            raise KeyError(account_id)
        currency = "CNY" if account_id == "all" else selected[0]["currency"]
        transactions = sorted(
            [{**item, "instrumentId": item.get("instrumentId") or item.get("instrument_id"), "_parsedTime": transaction_time(item["date"])} for account in selected for item in account.get("transactions", [])],
            key=lambda item: (item["_parsedTime"], item.get("createdAt", "")),
        )
        self.warnings = []
        ids = list(dict.fromkeys(item["instrumentId"] for item in transactions if item["type"] in {"buy", "sell"} and item.get("instrumentId")))
        self.instruments = {item["id"]: item for item in self.provider.get_instruments(ids)}
        for instrument_id in ids:
            if instrument_id not in self.instruments:
                self.instruments[instrument_id] = {"id": instrument_id, "name": instrument_id, "code": instrument_id, "currency": self.native_currency(instrument_id)}
        self.histories = {}
        self.fx_histories = {}
        self.fx_current = {}
        for instrument_id in ids:
            self.history(instrument_id)
        currencies = {account["currency"] for account in selected} | {item["currency"] for item in self.instruments.values()}
        for item in currencies - {"CNY"}:
            self.history(f"fx-{item.lower()}cny")
        cash, contributions, positions, realized = self.ledger(selected, transactions, None)
        current_cash = self.convert_accounts(cash, currency, None)
        current_contributions = self.convert_accounts(contributions, currency, None)
        rows = []
        market_value = unrealized = day_pnl = 0.0
        incomplete_values = incomplete_day = False
        realized_total = 0.0
        for instrument_id, position in positions.items():
            instrument = self.instruments[instrument_id]
            native = instrument["currency"]
            converted_realized = self.convert_current(position["realized"], native, currency)
            if converted_realized is None:
                realized_total = None
            elif realized_total is not None:
                realized_total += converted_realized
            if position["quantity"] <= 0:
                continue
            price = instrument.get("price")
            if price is None or price <= 0:
                history = self.histories.get(instrument_id)
                if history and history["candles"]:
                    price = history["candles"][-1]["close"]
                    self.warn(f"{instrument['name']} 使用最近收盘价估值")
            quantity = position["quantity"]
            average_cost = position["cost"] / quantity
            native_value = quantity * price if price is not None else None
            native_unrealized = (price - average_cost) * quantity if price is not None else None
            converted_value = self.convert_current(native_value, native, currency)
            converted_unrealized = self.convert_current(native_unrealized, native, currency)
            if converted_value is None:
                market_value = None
            elif market_value is not None:
                market_value += converted_value
            if converted_unrealized is None:
                unrealized = None
            elif unrealized is not None:
                unrealized += converted_unrealized
            daily = self.daily_pnl(instrument_id, instrument, price, quantity)
            converted_daily = self.convert_current(daily, native, currency)
            if converted_daily is None:
                incomplete_day = True
            else:
                day_pnl += converted_daily
            rows.append({
                "instrumentId": instrument_id, "name": instrument.get("name", instrument_id),
                "code": instrument.get("code", instrument_id), "market": instrument.get("market", ""),
                "currency": native, "quantity": quantity, "costPrice": average_cost,
                "price": price, "marketValue": native_value, "weight": None,
                "unrealizedPnl": native_unrealized, "realizedPnl": position["realized"],
                "returnPct": (price / average_cost - 1) * 100 if price is not None and average_cost > 0 else None,
            })
        rows.sort(key=lambda item: item["marketValue"] or 0, reverse=True)
        total_assets = current_cash + market_value if current_cash is not None and market_value is not None else None
        if total_assets:
            for row in rows:
                converted = self.convert_current(row["marketValue"], row["currency"], currency)
                row["weight"] = converted / total_assets * 100 if converted is not None else None
        total_pnl = total_assets - current_contributions if total_assets is not None and current_contributions is not None else None
        total_return = total_pnl / abs(current_contributions) * 100 if total_pnl is not None and current_contributions else None
        curve = self.equity_curve(selected, transactions, currency, total_assets)
        return {
            "accountId": account_id, "currency": currency, "totalAssets": total_assets,
            "cash": current_cash, "marketValue": market_value,
            "dayPnl": None if incomplete_day else day_pnl,
            "totalPnl": total_pnl, "totalReturn": total_return,
            "unrealizedPnl": unrealized, "realizedPnl": realized_total,
            "positions": rows, "curve": curve, "warnings": list(dict.fromkeys(self.warnings)),
        }

    @staticmethod
    def select_accounts(accounts, account_id):
        if account_id == "all":
            return [item for item in accounts if item["type"] != "汇总账户"]
        account = next((item for item in accounts if item["id"] == account_id), None)
        if not account:
            raise KeyError(account_id)
        if account["type"] != "汇总账户":
            return [account]
        by_id = {item["id"]: item for item in accounts}
        return [by_id[item] for item in account.get("members", []) if item in by_id and by_id[item]["type"] != "汇总账户"]

    @staticmethod
    def native_currency(instrument_id):
        return "USD" if instrument_id.startswith("us-") else "HKD" if instrument_id.startswith("hk-") else "CNY"

    def warn(self, message):
        self.warnings.append(message)

    def history(self, instrument_id):
        if instrument_id in self.histories:
            return self.histories[instrument_id]
        try:
            candles = self.provider.candles(instrument_id, "day", 50000)["candles"]
        except (OSError, ValueError, KeyError, RuntimeError) as error:
            self.warn(f"{instrument_id} 的历史行情暂不可用：{error}")
            candles = []
        result = {"dates": [datetime.fromtimestamp(item["time"], timezone.utc).date() for item in candles], "candles": candles}
        self.histories[instrument_id] = result
        return result

    def price_at(self, instrument_id, date):
        history = self.history(instrument_id)
        index = bisect_right(history["dates"], date) - 1
        return history["candles"][index]["close"] if index >= 0 else None

    def fx_rate(self, source, target, date):
        if source == target:
            return 1.0
        source_rate = 1.0 if source == "CNY" else self.price_at(f"fx-{source.lower()}cny", date)
        target_rate = 1.0 if target == "CNY" else self.price_at(f"fx-{target.lower()}cny", date)
        if source_rate is None or not target_rate:
            return None
        return source_rate / target_rate

    def convert_current(self, value, source, target):
        if value is None:
            return None
        if source == target:
            return value
        key = (source, target)
        if key not in self.fx_current:
            today = datetime.now(timezone.utc).date()
            rate = None
            try:
                source_quote = 1.0 if source == "CNY" else self.provider.yahoo.quote(f"fx-{source.lower()}cny")["price"]
                target_quote = 1.0 if target == "CNY" else self.provider.yahoo.quote(f"fx-{target.lower()}cny")["price"]
                if target_quote:
                    rate = source_quote / target_quote
            except (OSError, ValueError, KeyError, RuntimeError):
                rate = self.fx_rate(source, target, today)
            if rate is None:
                self.warn(f"缺少 {source}/{target} 汇率，相关金额暂未折算")
            self.fx_current[key] = rate
        rate = self.fx_current[key]
        return value * rate if rate is not None else None

    def convert_accounts(self, values, target, date):
        total = 0.0
        for account_id, value in values.items():
            account = self.accounts_by_id[account_id]
            if date:
                rate = self.fx_rate(account["currency"], target, date)
                converted = value * rate if rate is not None else None
            else:
                converted = self.convert_current(value, account["currency"], target)
            if converted is None:
                return None
            total += converted
        return total

    def ledger(self, selected, transactions, date):
        self.accounts_by_id = {item["id"]: item for item in selected}
        cash = {item["id"]: float(item.get("initial", 0)) for item in selected}
        contributions = dict(cash)
        positions = {}
        realized = {}
        for transaction in transactions:
            if date and transaction["_parsedTime"].date() > date:
                continue
            account = self.accounts_by_id[transaction["accountId"]]
            kind = transaction["type"]
            amount = float(transaction.get("amount") or 0)
            fee = float(transaction.get("fee") or 0)
            if kind == "deposit":
                if cash[account["id"]] is not None:
                    cash[account["id"]] += amount - fee
                contributions[account["id"]] += amount
                continue
            if kind == "withdraw":
                if cash[account["id"]] is not None:
                    cash[account["id"]] -= amount + fee
                contributions[account["id"]] -= amount
                continue
            instrument_id = transaction["instrumentId"]
            quantity = float(transaction["quantity"])
            price = float(transaction["price"])
            native = self.instruments[instrument_id]["currency"]
            position = positions.setdefault(instrument_id, {"quantity": 0.0, "cost": 0.0})
            realized.setdefault(instrument_id, 0.0)
            if kind == "buy":
                position["quantity"] += quantity
                position["cost"] += quantity * price + fee
                cash_change = -(quantity * price + fee)
            else:
                if quantity > position["quantity"] + 1e-8:
                    raise ValueError(f"{transaction['date']} 卖出 {self.instruments[instrument_id]['name']} 的数量超过当时持仓")
                average = position["cost"] / position["quantity"] if position["quantity"] else 0
                position["cost"] -= average * quantity
                position["quantity"] -= quantity
                realized[instrument_id] += quantity * (price - average) - fee
                cash_change = quantity * price - fee
            rate = self.fx_rate(native, account["currency"], transaction["_parsedTime"].date())
            if rate is None:
                cash[account["id"]] = None
            elif cash[account["id"]] is not None:
                cash[account["id"]] += cash_change * rate
        for instrument_id, position in positions.items():
            position["realized"] = realized.get(instrument_id, 0.0)
        return cash, contributions, positions, realized

    def daily_pnl(self, instrument_id, instrument, price, quantity):
        if price is None:
            return None
        history = self.history(instrument_id)
        if not history["candles"]:
            return None
        quote_time = instrument.get("quoteTime")
        quote_date = transaction_time(quote_time).date() if quote_time else datetime.now(timezone.utc).date()
        index = bisect_right(history["dates"], quote_date) - 1
        if index < 0:
            return None
        if history["dates"][index] == quote_date:
            index -= 1
        if index < 0:
            return None
        previous = history["candles"][index]["close"]
        return quantity * (price - previous)

    def equity_curve(self, selected, transactions, currency, total_assets):
        if not transactions:
            if total_assets:
                return [{"date": datetime.now(timezone.utc).date().isoformat(), "value": total_assets}]
            return []
        start = min(item["_parsedTime"].date() for item in transactions)
        today = datetime.now(timezone.utc).date()
        dates = {item["_parsedTime"].date() for item in transactions}
        for history in self.histories.values():
            dates.update(date for date in history["dates"] if start <= date <= today)
        dates.add(today)
        curve = []
        for date in sorted(dates):
            cash, _, positions, _ = self.ledger(selected, transactions, date)
            value = self.convert_accounts(cash, currency, date)
            if value is None:
                continue
            complete = True
            for instrument_id, position in positions.items():
                if position["quantity"] <= 0:
                    continue
                price = self.price_at(instrument_id, date)
                native = self.instruments[instrument_id]["currency"]
                rate = self.fx_rate(native, currency, date)
                if price is None or rate is None:
                    complete = False
                    break
                value += position["quantity"] * price * rate
            if complete:
                curve.append({"date": date.isoformat(), "value": value})
        if total_assets is not None:
            point = {"date": today.isoformat(), "value": total_assets}
            if curve and curve[-1]["date"] == point["date"]:
                curve[-1] = point
            else:
                curve.append(point)
        return curve
