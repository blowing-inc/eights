import fs from "fs";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const diff = process.env.DIFF;

if (!diff || diff.trim().length === 0) {
  fs.writeFileSync("review.md", "No relevant frontend changes detected.");
  process.exit(0);
}

const prompt = `
You are a senior React engineer reviewing a pull request.

Focus on:
- React hook correctness (dependencies, stale closures)
- unnecessary re-renders
- component structure and separation of concerns
- async safety (race conditions, stale state)
- state management issues
- performance pitfalls

Do NOT comment on:
- formatting
- lint issues
- naming style

Be concise, technical, and actionable.

Return output in this format:

### ⚠️ Issues
- ...

### 💡 Suggestions
- ...

### 🚀 Performance Notes
- ...

Tech stack:
- React 18
- TypeScript
- Vite
- Supabase

Here is the diff:
`;

async function run() {
  try {
    const response = await client.responses.create({
      model: "gpt-5.3",
      input: [
        {
          role: "user",
          content: `${prompt}\n${diff}`,
        },
      ],
      max_output_tokens: 1200,
    });

    const output = response.output_text || "No feedback generated.";

    fs.writeFileSync("review.md", output);
    console.log("Review generated.");
  } catch (err) {
    console.error("Codex API failed:", err.message);
    process.exit(1);
  }
}

run();