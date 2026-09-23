from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from duckhunt_server.app import HighScore, HighScoreTable, create_app


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    (tmp_path / "index.html").write_text("<h1>Duck Hunt</h1>")
    (tmp_path / "duckhunt.wasm").write_bytes(b"\0asm\x01\0\0\0")
    return tmp_path


@pytest.fixture
def client(static_dir: Path) -> TestClient:
    return TestClient(create_app(static_dir))


def post(client: TestClient, name: str, score: int, round: int = 1):
    return client.post("/api/highscores", json={"name": name, "score": score, "round": round})


class TestApi:
    def test_health(self, client: TestClient) -> None:
        assert client.get("/api/health").json() == {"status": "ok"}

    def test_highscores_start_empty(self, client: TestClient) -> None:
        assert client.get("/api/highscores").json() == []

    def test_submit_returns_rank_and_sorted_table(self, client: TestClient) -> None:
        assert post(client, "ann", 500).json()["rank"] == 1
        res = post(client, "bob", 1500, 2)
        assert res.status_code == 201
        body = res.json()
        assert body["rank"] == 1
        assert [s["name"] for s in body["scores"]] == ["bob", "ann"]
        assert client.get("/api/highscores").json() == body["scores"]

    def test_name_is_trimmed(self, client: TestClient) -> None:
        assert post(client, "  cid  ", 10).json()["scores"][0]["name"] == "cid"

    @pytest.mark.parametrize(
        "payload",
        [
            {"name": "", "score": 1, "round": 1},
            {"name": "x" * 13, "score": 1, "round": 1},
            {"name": "<script>", "score": 1, "round": 1},
            {"name": "ann", "score": -1, "round": 1},
            {"name": "ann", "score": 1, "round": 0},
            {"name": "ann"},
        ],
    )
    def test_rejects_invalid_scores(self, client: TestClient, payload: dict) -> None:
        assert client.post("/api/highscores", json=payload).status_code == 422


class TestStatic:
    def test_serves_index(self, client: TestClient) -> None:
        res = client.get("/")
        assert res.status_code == 200
        assert "Duck Hunt" in res.text

    def test_serves_wasm(self, client: TestClient) -> None:
        res = client.get("/duckhunt.wasm")
        assert res.status_code == 200
        assert res.content.startswith(b"\0asm")

    def test_hint_when_frontend_missing(self, tmp_path: Path) -> None:
        client = TestClient(create_app(tmp_path / "missing"))
        res = client.get("/")
        assert res.status_code == 200
        assert "make build" in res.text
        assert client.get("/api/health").status_code == 200

    def test_static_dir_from_env(self, static_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("DUCKHUNT_STATIC_DIR", str(static_dir))
        assert "Duck Hunt" in TestClient(create_app()).get("/").text


class TestHighScoreTable:
    def test_keeps_only_top_n(self) -> None:
        table = HighScoreTable(limit=3)
        for i in range(5):
            table.add(HighScore(name=f"p{i}", score=i * 100, round=1))
        assert [s.score for s in table.top()] == [400, 300, 200]

    def test_low_score_is_not_ranked_when_full(self) -> None:
        table = HighScoreTable(limit=2)
        table.add(HighScore(name="a", score=100, round=1))
        table.add(HighScore(name="b", score=200, round=1))
        assert table.add(HighScore(name="c", score=50, round=1)) is None
        assert len(table.top()) == 2

    def test_ties_keep_earlier_entry_first(self) -> None:
        table = HighScoreTable()
        table.add(HighScore(name="first", score=100, round=1))
        assert table.add(HighScore(name="second", score=100, round=1)) == 2
        assert [s.name for s in table.top()] == ["first", "second"]
