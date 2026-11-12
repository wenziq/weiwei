import csv
from io import BytesIO, StringIO
from zipfile import ZipFile
from xml.etree import ElementTree as ET

from .http import fetch_bytes
from .parsing import search_names


def base_instrument(instrument_id, code, name, market, currency, industry, source, tags):
    return {
        "id": instrument_id, "code": code, "name": name, "market": market, "currency": currency,
        "industry": industry, "price": None, "changePct": None, "amount": None, "turnover": None,
        "cap": None, "deltaPct": None, "sincePct": 0, "status": "未研究",
        "tags": tags, "spark": [], "dividend": None, "roe": None, "net": None, "debt": None,
        "dataSource": source, "dataStatus": "unavailable", "quoteTime": None, **search_names(name),
    }


def hongkong_catalog():
    errors = []
    for url in [
        "https://www.hkex.com.hk/chi/services/trading/securities/securitieslists/ListOfSecurities_c.xlsx",
        "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx",
    ]:
        try:
            with ZipFile(BytesIO(fetch_bytes(url, timeout=25, retries=1))) as workbook:
                shared = ["".join(node.itertext()) for node in ET.fromstring(workbook.read("xl/sharedStrings.xml"))]
                sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
            instruments = []
            for row in sheet.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
                cells = {}
                for cell in row:
                    if not cell.tag.endswith("}c"):
                        continue
                    node = next((child for child in cell if child.tag.endswith("}v")), None)
                    value = node.text if node is not None else ""
                    if cell.get("t") == "s" and value:
                        value = shared[int(value)]
                    column = "".join(character for character in cell.get("r", "") if character.isalpha())
                    cells[column] = value
                if cells.get("C") not in {"Equity", "Real Estate Investment Trusts"}:
                    continue
                code = cells["A"].strip().zfill(5)
                currency = {"RMB": "CNH"}.get(cells.get("Q", "HKD").strip(), cells.get("Q", "HKD").strip())
                instruments.append(base_instrument(
                    f"hk-{code}", code, cells["B"].strip(), "HK", currency,
                    cells.get("D", "香港股票"), "港交所证券名单", ["港股"],
                ))
            if not instruments:
                raise ValueError("港交所证券名单未包含股票")
            return instruments
        except (OSError, ValueError, KeyError, ET.ParseError) as error:
            errors.append(error)
    raise RuntimeError(f"港交所证券名单读取失败: {errors[-1]}")


def us_catalog():
    rows = []
    for filename in ["nasdaqlisted.txt", "otherlisted.txt"]:
        text = fetch_bytes(f"https://www.nasdaqtrader.com/dynamic/SymDir/{filename}", timeout=25, retries=1).decode("utf-8-sig")
        rows.extend(csv.DictReader(StringIO(text), delimiter="|"))
    instruments = []
    for row in rows:
        code = (row.get("Symbol") or row.get("ACT Symbol") or "").strip().upper()
        name = (row.get("Security Name") or "").strip()
        if not code or not name or row.get("Test Issue", "N") != "N" or row.get("ETF") == "Y":
            continue
        normalized = code.replace("/", ".")
        instruments.append(base_instrument(
            f"us-{normalized.lower()}", normalized, name, "US", "USD", "美国股票",
            "Nasdaq Trader 证券目录", ["美股"],
        ))
    if not instruments:
        raise ValueError("Nasdaq Trader 证券目录为空")
    return instruments
