import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHighScores, submitHighScore } from "../src/api";

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("fetches high scores", async () => {
    const scores = [{ name: "ANN", score: 900, round: 2 }];
    const fetch = mockFetch(scores);
    await expect(fetchHighScores()).resolves.toEqual(scores);
    expect(fetch).toHaveBeenCalledWith("/api/highscores");
  });

  it("posts a new score as JSON", async () => {
    const fetch = mockFetch({ rank: 1, scores: [] });
    const entry = { name: "BOB", score: 500, round: 1 };
    await expect(submitHighScore(entry)).resolves.toEqual({ rank: 1, scores: [] });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/highscores");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(entry);
  });

  it("throws on HTTP errors", async () => {
    mockFetch({}, false, 500);
    await expect(fetchHighScores()).rejects.toThrow("500");
    mockFetch({}, false, 422);
    await expect(submitHighScore({ name: "", score: 0, round: 1 })).rejects.toThrow("422");
  });
});
