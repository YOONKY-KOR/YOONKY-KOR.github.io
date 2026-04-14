const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const OUTPUT_DIR = path.join(__dirname, "../content/posts");

async function syncPosts() {
  console.log("Fetching posts from Notion...");

  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: "Status",
      select: {
        equals: "Published",
      },
    },
  });

  for (const page of response.results) {
    const props = page.properties;
    const title = props.Title?.title?.[0]?.plain_text || "Untitled";
    const slug = props.Slug?.rich_text?.[0]?.plain_text || slugify(title);
    const date =
      props.Date?.date?.start || new Date().toISOString().split("T")[0];
    const tags = (props.Tags?.multi_select || []).map((t) => t.name);
    const categories = (props.Categories?.multi_select || []).map(
      (c) => c.name
    );
    const description = props.Description?.rich_text?.[0]?.plain_text || "";
    const draft = props.Status?.select?.name !== "Published";

    const mdBlocks = await n2m.pageToMarkdown(page.id);
    const mdString = n2m.toMarkdownString(mdBlocks);

    const frontmatter = `---
title: "${title}"
date: ${date}
draft: ${draft}
tags: [${tags.map((t) => `"${t}"`).join(", ")}]
categories: [${categories.map((c) => `"${c}"`).join(", ")}]
description: "${description}"
showToc: true
---

`;

    const content = frontmatter + mdString.parent;
    const filename = `${slug}.md`;
    const filepath = path.join(OUTPUT_DIR, filename);

    fs.writeFileSync(filepath, content, "utf-8");
    console.log(`Synced: ${filename}`);
  }

  console.log("Sync complete.");
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\uAC00-\uD7A3\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

syncPosts().catch(console.error);
