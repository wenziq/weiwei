import json
import os
import threading
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable


class JsonDocumentStore:
    def __init__(self, data_dir: Path, seed_path: Path):
        self.data_dir = data_dir
        self.seed_path = seed_path
        self.lock = threading.RLock()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        with self.seed_path.open("r", encoding="utf-8") as seed_file:
            self.seeds = json.load(seed_file)
        for name in self.seeds:
            path = self.path_for(name)
            if not path.exists():
                self.write(name, deepcopy(self.seeds[name]))

    def path_for(self, name: str) -> Path:
        if name not in self.seeds:
            raise KeyError(f"Unknown document namespace: {name}")
        return self.data_dir / f"{name}.json"

    def read(self, name: str) -> Any:
        with self.lock:
            with self.path_for(name).open("r", encoding="utf-8") as file:
                return json.load(file)

    def write(self, name: str, value: Any) -> None:
        with self.lock:
            path = self.path_for(name)
            temporary = path.with_suffix(".tmp")
            with temporary.open("w", encoding="utf-8") as file:
                json.dump(value, file, ensure_ascii=False, indent=2)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, path)

    def update(self, name: str, mutator: Callable[[Any], Any]) -> Any:
        with self.lock:
            value = self.read(name)
            result = mutator(value)
            self.write(name, value)
            return result
