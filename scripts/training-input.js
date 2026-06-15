const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Notion DB IDs (from collection URLs)
const GYM_CALENDAR_ID    = "2e2256d3-e053-81e7-9f5b-000bdf008452";
const WORKOUT_LOG_ID     = "2e2256d3-e053-81c2-8ac8-000ba7d6bee8";
const EXERCISE_LIB_ID   = "2e2256d3-e053-8130-94e5-000b2e7efe79";

const INDEX_HTML = path.join(__dirname, "../static/training/index.html");

// 중량 문자열 → kg 숫자 파싱 (예: "60kg" → 60, "10kg×2" → 10)
function parseKg(weightStr) {
  if (!weightStr) return null;
  const m = weightStr.match(/(\d+(?:\.\d+)?)\s*kg/i);
  return m ? parseFloat(m[1]) : null;
}

// Exercise Library에서 운동명으로 검색
async function findExercise(name) {
  const res = await notion.databases.query({
    database_id: EXERCISE_LIB_ID,
    filter: { property: "Name", title: { equals: name } }
  });
  return res.results[0] || null;
}

// Exercise Library에 새 운동 추가
async function createExercise(name) {
  console.log(`Exercise Library에 추가: ${name}`);
  const page = await notion.pages.create({
    parent: { database_id: EXERCISE_LIB_ID },
    properties: {
      Name: { title: [{ text: { content: name } }] }
    }
  });
  return page;
}

// Gym Calendar 항목 생성
async function createGymCalendar({ week, day, date, intensity }) {
  const dayLabel = `Day ${day} (${["A","C"].includes(day) ? "수업" : "개인"})`;
  const name = `${week}주차 ${dayLabel}`;
  console.log(`Gym Calendar 생성: ${name}`);
  const page = await notion.pages.create({
    parent: { database_id: GYM_CALENDAR_ID },
    properties: {
      Name:            { title: [{ text: { content: name } }] },
      Day:             { select: { name: dayLabel } },
      Date:            { date: { start: date } },
      "Intensity Level": { select: { name: intensity } }
    }
  });
  return page;
}

// Strength Workout Log 항목 생성
async function createWorkoutLog({ order, name, sets, reps, weight, calendarId, exerciseId }) {
  const kg = parseKg(weight);
  const setProps = {};
  if (kg !== null) {
    setProps["Set 1 (kg)"]  = { number: kg };
    setProps["Set 2 (kg)"]  = { number: kg };
    setProps["Set 3 (kg) "] = { number: kg }; // trailing space 주의
    setProps["Set 4 (kg)"]  = { number: kg };
  }

  const props = {
    Order:   { title: [{ text: { content: `${order}. ${name}` } }] },
    Workout: { relation: [{ id: calendarId }] },
    ...setProps
  };
  if (exerciseId) {
    props.Exercise = { relation: [{ id: exerciseId }] };
  }

  await notion.pages.create({
    parent: { database_id: WORKOUT_LOG_ID },
    properties: props
  });
  console.log(`  Workout Log 추가: ${order}. ${name} (${weight || "-"})`);
}

// index.html weekExercises 업데이트
function updateIndexHtml({ week, day, exercises, tag }) {
  let html = fs.readFileSync(INDEX_HTML, "utf-8");

  const exArray = exercises.map((ex, i) => {
    const id = `${day.toLowerCase()}${week}_${i+1}`;
    const sets  = ex.sets  || null;
    const reps  = ex.reps  || null;
    const weight = ex.weight || "";
    const note  = ex.note  || "";
    return `      {id:"${id}",name:${JSON.stringify(ex.name)},sets:${sets},reps:${reps},weight:${JSON.stringify(weight)},note:${JSON.stringify(note)}}`;
  }).join(",\n");

  const weekTag = tag || exercises.map(e => e.name).slice(0,2).join(" + ");

  // 삽입할 코드
  const newEntry = `    ${week}:{tag:${JSON.stringify(weekTag)},exercises:[\n${exArray},\n    ]},`;

  // 해당 Day의 weekExercises 블록 찾기
  // 패턴: Day X 라벨 근처의 weekExercises:{
  const dayPatterns = {
    A: /A:\{label:"Day A"[^}]*weekExercises:\{/,
    B: /B:\{label:"Day B"[^}]*weekExercises:\{/,
    C: /C:\{label:"Day C"[^}]*weekExercises:\{/,
    D: /D:\{label:"Day D"[^}]*weekExercises:\{/,
  };

  // 더 안전한 방식: 주석 마커 방식으로 삽입
  // BASE_SESSIONS 내에서 해당 세션의 weekExercises 블록에 주차 데이터 추가
  const sessionPattern = new RegExp(
    `(${day}:\\{label:"Day ${day}"[^{]*weekExercises:\\{)([^]*?)(\\}\\})`
  );

  const match = html.match(sessionPattern);
  if (!match) {
    // weekExercises:{} 빈 객체인 경우
    const emptyPattern = new RegExp(
      `(${day}:\\{label:"Day ${day}"[^{]*type:"[^"]*",weekExercises:\\{)(\\})`
    );
    if (html.match(emptyPattern)) {
      html = html.replace(emptyPattern, (_, pre, close) => {
        return `${pre}\n    ${week}:{tag:${JSON.stringify(weekTag)},exercises:[\n${exArray},\n    ]},\n  ${close}`;
      });
    } else {
      console.error("index.html에서 해당 세션 블록을 찾지 못했습니다.");
      return false;
    }
  } else {
    // 이미 데이터가 있는 경우: 주차 항목이 없으면 추가
    const weekKey = `${week}:{`;
    if (match[2].includes(weekKey)) {
      console.log(`index.html: ${day} ${week}주차 데이터가 이미 있습니다. 건너뜁니다.`);
      return false;
    }
    html = html.replace(sessionPattern, (_, pre, inner, close) => {
      return `${pre}${inner}\n    ${week}:{tag:${JSON.stringify(weekTag)},exercises:[\n${exArray},\n    ]},\n  ${close}`;
    });
  }

  fs.writeFileSync(INDEX_HTML, html, "utf-8");
  console.log(`index.html 업데이트: Day ${day} ${week}주차`);
  return true;
}

// Git commit & push
function gitPush({ week, day }) {
  const repoRoot = path.join(__dirname, "..");
  const msg = `training: ${week}주차 Day ${day} 수업 입력`;
  execSync(`git config user.name "${process.env.GIT_USER_NAME || "github-actions[bot]"}"`, { cwd: repoRoot });
  execSync(`git config user.email "${process.env.GIT_USER_EMAIL || "github-actions[bot]@users.noreply.github.com"}"`, { cwd: repoRoot });
  execSync(`git add static/training/index.html`, { cwd: repoRoot });
  const diff = execSync(`git diff --cached --stat`, { cwd: repoRoot }).toString();
  if (!diff.trim()) { console.log("index.html 변경 없음 — push 생략"); return; }
  execSync(`git commit -m "${msg}"`, { cwd: repoRoot });
  execSync(`git push`, { cwd: repoRoot });
  console.log(`Git push 완료: ${msg}`);
}

// ── 메인
async function main() {
  const raw = process.env.WORKOUT_DATA;
  if (!raw) { console.error("WORKOUT_DATA 환경변수가 없습니다."); process.exit(1); }

  let data;
  try { data = JSON.parse(raw); }
  catch (e) { console.error("JSON 파싱 실패:", e.message); process.exit(1); }

  const { week, day, date, intensity, exercises } = data;
  console.log(`\n=== ${week}주차 Day ${day} (${date}) ${intensity} ===`);
  console.log(`운동 ${exercises.length}개\n`);

  // 1. Gym Calendar 생성
  const calPage = await createGymCalendar({ week, day, date, intensity });
  const calendarId = calPage.id;

  // 2. 운동별 처리
  const tag = exercises.map(e => e.name).slice(0, 2).join(" + ");

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];

    // Exercise Library 조회/생성
    let exPage = await findExercise(ex.name);
    if (!exPage) exPage = await createExercise(ex.name);

    // Strength Workout Log 생성
    await createWorkoutLog({
      order: i + 1,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      weight: ex.weight,
      calendarId,
      exerciseId: exPage.id
    });
  }

  // 3. index.html 업데이트
  const updated = updateIndexHtml({ week, day, exercises, tag });

  // 4. Git push (index.html 변경된 경우만)
  if (updated) gitPush({ week, day });

  console.log("\n✓ 완료");
}

main().catch(e => { console.error(e); process.exit(1); });
