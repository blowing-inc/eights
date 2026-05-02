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

function extractValidLines(diffText) {
  const fileMap = {};
  const lines = diffText.split("\n");

  let currentFile = null;
  let newLineNumber = 0;

  for (let line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.replace("+++ b/", "").trim();
      fileMap[currentFile] = [];
    }

    const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNumber = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      fileMap[currentFile].push(newLineNumber);
      newLineNumber++;
    } else if (line.startsWith("-")) {
      continue;
    } else {
      newLineNumber++;
    }
  }

  return fileMap;
}

const validLinesByFile = extractValidLines(diff);

const fileLineHints = Object.entries(validLinesByFile)
  .map(([file, lines]) => {
    const sample = lines.slice(0, 20).join(", ");
    return `${file}: [${sample}${lines.length > 20 ? ", ..." : ""}]`;
  })
  .join("\n");

const prompt = `You are a senior React engineer reviewing a pull request.

Your job is to identify meaningful, real-world issues—not stylistic or trivial ones.

Focus on:
- React hook correctness (dependencies, stale closures)
- unnecessary re-renders
- async safety (race conditions, stale state updates)
- component structure and separation of concerns
- state management issues
- performance pitfalls

STRICT RULES:
- ONLY comment on lines that were added in this diff
- ONLY use valid file/line combinations provided
- DO NOT invent line numbers
- DO NOT comment on formatting, lint, or naming style
- Skip uncertain or low-confidence comments

Each comment MUST include:
- severity: "high" | "medium" | "low"
- category: "hooks" | "performance" | "async" | "structure" | "state"
- a concise, technical, actionable explanation
- a suggested fix when possible

Severity guidelines:
- high → likely bug, broken logic, race condition, incorrect hook usage
- medium → architectural concern, maintainability risk, inefficient pattern
- low → minor optimization or improvement

Be concise, technical, and actionable.

Return ONLY valid JSON in this format:

{
  "comments": [
    {
      "file": "exact/file/path.tsx",
      "line": valid_line_number,
      "severity": "high",
      "category": "hooks",
      "body": "Explain the issue and suggest a fix"
    }
  ],
  "summary": "Grouped summary by severity with key risks highlighted"
}

Valid file/line targets:
{{FILE_LINE_HINTS}}

Here is the diff:
{{DIFF}}
`.replace("{{FILE_LINE_HINTS}}", fileLineHints)
 .replace("{{DIFF}}", diff);

async function run() {
  try {
    const response = await client.responses.create({
      model: "gpt-5.3",
      input: prompt,
      max_output_tokens: 1500,
    });

    let parsed;
    try {
      parsed = JSON.parse(response.output_text || "{}");
    } catch {
      console.log("Failed to parse response.");
      process.exit(0);
    }

    const comments = parsed.comments || [];
    const summary = parsed.summary || "Codex review completed.";

    if (comments.length === 0) {
      console.log("No valid comments.");
      process.exit(0);
    }

    let posted = 0;

    const grouped = {
      high: [],
      medium: [],
      low: [],
    };

    for (const c of comments) {
      const validLines = validLinesByFile[c.file] || [];

      if (!validLines.includes(c.line)) {
        console.log(`Skipping invalid line ${c.line} in ${c.file}`);
        continue;
      }

      grouped[c.severity]?.push(c);

      try {
        execSync(
          `gh api repos/${repo}/pulls/${prNumber}/comments \
          -f body="${c.body}" \
          -f path="${c.file}" \
          -F line=${c.line}`,
          { stdio: "inherit" }
        );
        posted++;
      } catch (err) {
        console.error("Failed to post comment:", err.message);
      }
    }

    // Build grouped summary
    const buildSection = (title, items) => {
      if (!items.length) return "";
      return `### ${title}\n` + items.map(i => `- ${i.body}`).join("\n");
    };

    const groupedSummary = `
## 🔍 Codex Review Summary

${buildSection("🔴 High Severity", grouped.high)}
${buildSection("🟠 Medium Severity", grouped.medium)}
${buildSection("🟢 Low Severity", grouped.low)}

---

${summary}
`;

    if (posted === 0) {
      execSync(
        `gh pr comment ${prNumber} -b "Codex found issues but could not safely map inline comments.\n\n${groupedSummary}"`,
        { stdio: "inherit" }
      );
      return;
    }

    execSync(
      `gh pr comment ${prNumber} -b "${groupedSummary}"`,
      { stdio: "inherit" }
    );

  } catch (err) {
    console.error("Codex failed:", err.message);
    process.exit(1);
  }
}

run();