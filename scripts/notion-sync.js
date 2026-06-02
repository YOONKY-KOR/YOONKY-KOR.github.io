const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const CONTENT_ROOT = path.join(__dirname, "../content");

// Notion Category → Hugo section 폴더 매핑
const CATEGORY_MAP = {
  "Architecture": "architecture",
  "Azure": "azure",
  "AI": "ai",
  "Dev Notes": "posts",
};

// 카테고리명에서 특수문자 제거 (Hugo taxonomy URL 안전)
function sanitizeCategory(cat) {
  return cat.replace(/\s*\/\s*/g, "-").trim();
}

function getSectionDir(category) {
  return CATEGORY_MAP[category] || "posts";
}

// Notion DB에서 Published 포스트 전체 조회 (페이지네이션 처리)
async function fetchAllPublishedPages() {
  const pages = [];
  let cursor = undefined;

  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: "Status",
        select: { equals: "Published" },
      },
      start_cursor: cursor,
    });

    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

async function syncPosts() {
  console.log("Fetching posts from Notion...");

  const pages = await fetchAllPublishedPages();
  console.log(`Total published posts: ${pages.length}`);

  // 현재 동기화된 파일 추적 (섹션/슬러그 기준)
  const syncedFiles = new Set();

  for (const page of pages) {
    const props = page.properties;

    const title = props.Title?.title?.[0]?.plain_text || "Untitled";
    const slug = props.Slug?.rich_text?.[0]?.plain_text || slugify(title);

    // Published Date 필드 우선 사용, 없으면 created_time fallback
    const publishedDate = props["Published Date"]?.date?.start;
    const date = publishedDate
      ? publishedDate.split("T")[0]
      : page.created_time.split("T")[0];

    const tags = (props.Tags?.multi_select || []).map((t) => t.name);
    const category = props.Category?.select?.name || "";
    const summary = props.Summary?.rich_text?.[0]?.plain_text || "";
    const series = props.Series?.rich_text?.[0]?.plain_text || "";
    const seriesOrder = props["Series Order"]?.number ?? null;
    const section = getSectionDir(category);
    const outputDir = path.join(CONTENT_ROOT, section);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const mdBlocks = await n2m.pageToMarkdown(page.id);
    const mdString = n2m.toMarkdownString(mdBlocks);

    const lines = [
      `---`,
      `title: "${escapeQuotes(title)}"`,
      `date: ${date}`,
      `draft: false`,
    ];

    if (tags.length > 0) {
      lines.push(`tags: [${tags.map((t) => `"${t}"`).join(", ")}]`);
    }
    if (category) {
      lines.push(`categories: ["${sanitizeCategory(category)}"]`);
    }
    if (summary) {
      lines.push(`description: "${escapeQuotes(summary)}"`);
    }
    if (series) {
      lines.push(`series: ["${escapeQuotes(series)}"]`);
      if (seriesOrder !== null) {
        lines.push(`series_weight: ${seriesOrder}`);
      }
    }
    lines.push(`showToc: true`);
    lines.push(`---`);
    lines.push(``);

    const content = lines.join("\n") + "\n" + mdString.parent;
    const filename = `${slug}.md`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, content, "utf-8");
    console.log(`Synced: ${section}/${filename}`);
    syncedFiles.add(path.join(section, filename));
  }

  // 동기화 대상이 아닌 기존 .md 파일 삭제 (비공개/삭제 처리)
  cleanupStaleFiles(syncedFiles);

  console.log(`Sync complete. ${syncedFiles.size} post(s) written.`);
}

// Notion에서 내려간 포스트의 .md 파일 삭제
function cleanupStaleFiles(syncedFiles) {
  const sections = Object.values(CATEGORY_MAP);
  const uniqueSections = [...new Set(sections)];

  for (const section of uniqueSections) {
    const sectionDir = path.join(CONTENT_ROOT, section);
    if (!fs.existsSync(sectionDir)) continue;

    const files = fs.readdirSync(sectionDir).filter((f) => f.endsWith(".md") && f !== "_index.md");
    for (const file of files) {
      const relativePath = path.join(section, file);
      if (!syncedFiles.has(relativePath)) {
        fs.unlinkSync(path.join(sectionDir, file));
        console.log(`Removed stale file: ${relativePath}`);
      }
    }
  }
}

function escapeQuotes(str) {
  return str.replace(/"/g, '\\"');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

async function syncAboutPage() {
  const ABOUT_PAGE_ID = "345256d3e0538108b04bfd3e97e649c9";
  console.log("Fetching About page from Notion...");

  const mdBlocks = await n2m.pageToMarkdown(ABOUT_PAGE_ID);
  const mdString = n2m.toMarkdownString(mdBlocks);

  const today = new Date().toISOString().split("T")[0];
  const frontMatter = [
    `---`,
    `title: "About"`,
    `date: ${today}`,
    `layout: "about"`,
    `url: "/about/"`,
    `summary: "about"`,
    `---`,
    ``,
  ].join("\n");

  const filepath = path.join(CONTENT_ROOT, "about.md");
  fs.writeFileSync(filepath, frontMatter + mdString.parent, "utf-8");
  console.log("Synced: content/about.md");
}

async function main() {
  await syncPosts();
  await syncAboutPage();
}

main().catch(console.error);
