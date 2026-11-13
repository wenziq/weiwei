import json
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from ..core.config import settings

host_locks = {}
host_locks_guard = threading.Lock()
last_request = {}


def throttle(url):
    host = urlsplit(url).hostname or "unknown"
    with host_locks_guard:
        lock = host_locks.setdefault(host, threading.Lock())
    with lock:
        elapsed = time.monotonic() - last_request.get(host, 0)
        if elapsed < settings.http_min_interval_seconds:
            time.sleep(settings.http_min_interval_seconds - elapsed)
        last_request[host] = time.monotonic()


def fetch_bytes(url: str, timeout: float = 8, retries: int = 2, headers=None) -> bytes:
    last_error = None
    for attempt in range(retries + 1):
        try:
            throttle(url)
            request = Request(url, headers={"User-Agent": f"Mozilla/5.0 WeiWei/{settings.version}", "Accept": "*/*", **(headers or {})})
            with urlopen(request, timeout=timeout) as response:
                return response.read()
        except Exception as error:
            if isinstance(error, HTTPError) and error.code == 404:
                raise
            last_error = error
            if attempt < retries:
                time.sleep(0.35 * (attempt + 1))
    raise last_error


def fetch_json(url: str, timeout: float = 8, retries: int = 2):
    return json.loads(fetch_bytes(url, timeout, retries).decode("utf-8"))


def post_json(url: str, payload, headers=None, timeout=30):
    throttle(url)
    request = Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST", headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": f"Mozilla/5.0 WeiWei/{settings.version}", **(headers or {})})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))
