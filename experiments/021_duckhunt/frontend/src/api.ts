export interface HighScore {
  name: string;
  score: number;
  round: number;
}

export interface SubmitResult {
  rank: number | null;
  scores: HighScore[];
}

export async function fetchHighScores(): Promise<HighScore[]> {
  const response = await fetch("/api/highscores");
  if (!response.ok) throw new Error(`Failed to load high scores: ${response.status}`);
  return response.json();
}

export async function submitHighScore(entry: HighScore): Promise<SubmitResult> {
  const response = await fetch("/api/highscores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw new Error(`Failed to submit score: ${response.status}`);
  return response.json();
}
