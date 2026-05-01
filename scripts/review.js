import OpenAI from "openai";
import { execSync } from "child_process";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const diff = process.env.DIFF;
const prNumber = process.env.PR_NUMBER;
const repo = process.env.REPO;

if (!diff || diff.trim().length === 0) {
  console.log("No relevant changes.");
  process.exit(0);
}

const prompt = `
You are a senior React engineer reviewing a pull request.

Focus on:
- React hook correctness
- unnecessary re-renders
- async safety
- stale closures
- performance issues

Return JSON in this exact format:

{
  "comments": [
    {
      "file": "path/to/file.tsx",
      "line": 42,
      "body": "Explain the issue and suggest a fix"
    }
  ],
  "summary": "High-level summary of issues"
}

Rules:
- Only comment on real issues
- No lint/style comments
- Keep comments actionable
`;

async function run() {
  try {
    const response = await client.responses.create({
      model: "gpt-5.3",
      input: `${prompt}\n\nDIFF:\n${diff}`,
      max_output_tokens: 1500,
    });

    const text = response.output_text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.log("Failed to parse response, skipping.");
      process.exit(0);
    }

    const comments = parsed.comments || [];
    const summary = parsed.summary || "Codex review completed.";

    if (comments.length === 0) {
      console.log("No actionable comments.");
      process.exit(0);
    }

    console.log(`Posting ${comments.length} inline comments...`);

    for (const c of comments) {
      try {
        execSync(
          `gh api repos/${repo}/pulls/${prNumber}/comments \
          -f body="${c.body}" \
          -f path="${c.file}" \
          -F line=${c.line}`,
          { stdio: "inherit" }
        );
      } catch (err) {
        console.error("Failed to post comment:", err.message);
      }
    }

    // Post summary comment
    execSync(
      `gh pr comment ${prNumber} -b "${summary}"`,
      { stdio: "inherit" }
    );

  } catch (err) {
    console.error("Codex failed:", err.message);
    process.exit(1);
  }
}

run();