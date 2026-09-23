"""FastAPI app: serves the built Duck Hunt frontend and an in-memory high-score API."""

import os
from pathlib import Path
from threading import Lock

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

MAX_SCORES = 10
DEFAULT_STATIC_DIR = Path(__file__).resolve().parents[3] / "frontend" / "dist"


class HighScore(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=12, pattern=r"^[\w .-]+$")
    score: int = Field(ge=0, le=10_000_000)
    round: int = Field(ge=1, le=1000)


class SubmitResult(BaseModel):
    rank: int | None
    scores: list[HighScore]


class HighScoreTable:
    """Top-N scores, highest first. Ties keep the earlier entry ahead."""

    def __init__(self, limit: int = MAX_SCORES) -> None:
        self._limit = limit
        self._scores: list[HighScore] = []
        self._lock = Lock()

    def top(self) -> list[HighScore]:
        with self._lock:
            return list(self._scores)

    def add(self, entry: HighScore) -> int | None:
        """Insert an entry; return its 1-based rank, or None if it didn't make the table."""
        with self._lock:
            self._scores.append(entry)
            self._scores.sort(key=lambda s: s.score, reverse=True)
            del self._scores[self._limit :]
            for i, s in enumerate(self._scores):
                if s is entry:
                    return i + 1
            return None


def create_app(static_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="Duck Hunt")
    table = HighScoreTable()

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/highscores")
    def get_highscores() -> list[HighScore]:
        return table.top()

    @app.post("/api/highscores", status_code=201)
    def post_highscore(entry: HighScore) -> SubmitResult:
        rank = table.add(entry)
        return SubmitResult(rank=rank, scores=table.top())

    static = static_dir or Path(os.environ.get("DUCKHUNT_STATIC_DIR", DEFAULT_STATIC_DIR))
    if static.is_dir():
        app.mount("/", StaticFiles(directory=static, html=True), name="static")
    else:

        @app.get("/", response_class=PlainTextResponse)
        def not_built() -> str:
            return f"Frontend not built ({static} missing). Run `make build`."

    return app


app = create_app()
