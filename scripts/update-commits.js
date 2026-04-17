const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const commitHash = process.argv[2];

if (!commitHash) {
  console.error("Usage: node update-commits.js <commit-hash>");
  process.exit(1);
}

async function updateCommits() {
  const syncedPath = path.join(__dirname, "synced-pages.json");

  if (!fs.existsSync(syncedPath)) {
    console.log("No synced-pages.json found. Skipping.");
    return;
  }

  const pageIds = JSON.parse(fs.readFileSync(syncedPath, "utf-8"));

  if (pageIds.length === 0) {
    console.log("No pages to update.");
    return;
  }

  console.log(`Updating GitHub Commit for ${pageIds.length} page(s)...`);

  for (const pageId of pageIds) {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        "GitHub Commit": {
          rich_text: [{ type: "text", text: { content: commitHash } }],
        },
      },
    });
    console.log(`  ✓ ${pageId} → ${commitHash}`);
  }

  fs.unlinkSync(syncedPath);
  console.log("Done.");
}

updateCommits().catch(console.error);
