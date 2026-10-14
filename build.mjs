// node build.mjs → dist/ (/: 메인, /<카테고리>/: 최신 헤드라인, /<카테고리>/YYYY-MM-DD/: 각 호, /<카테고리>/archive/: 목록)
import fs from "node:fs";

// 카테고리: data/<id>/YYYY-MM-DD.json(rss.mjs가 생성)이 있으면 활성, 없으면 "준비 중" 슬리브
const CATS = [
  { id: "ai", name: "AI", color: "amber", link: ["AI 트렌드", "https://litt.ly/ai.trend.kr"] },
  { id: "economy", name: "경제", color: "rose" },
  { id: "stock", name: "증시", color: "sage" },
  { id: "global", name: "해외증시", color: "slate" },
];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]);
const safeUrl = u => (/^https?:\/\//i.test(u) ? u : "#");
const dotDate = d => `${d.replaceAll("-", ".")} (${"일월화수목금토"[new Date(d + "T00:00:00Z").getUTCDay()]})`;
const hhmm = iso => iso ? new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(11, 16) : "";

// 공유 미리보기(카톡 등)는 절대 주소가 필요해서 사이트 주소를 고정해 둠
const SITE = "https://izusym.github.io/NEWS/";
// path: 사이트 첫 화면 기준 이 페이지 경로(예: "ai/2026-10-14/") → 아이콘·매니페스트 상대 경로와 공유 주소 계산
const homeOf = path => path.split("/").filter(Boolean).map(() => "../").join("");
const head = (title, desc, path) => fs.readFileSync("template.html", "utf8")
  .replaceAll("{{TITLE}}", esc(title)).replaceAll("{{DESC}}", esc(desc)).replaceAll("{{HOME}}", homeOf(path))
  .replaceAll("{{URL}}", SITE + path).replaceAll("{{SITE}}", SITE);
const appbar = (home, name, href, label, icon) =>
  `<header class="appbar"><a class="ic" href="${home}" aria-label="메인으로">‹</a><b>${esc(name)}</b><a class="ic" href="${href}" aria-label="${label}" title="${label}">${icon}</a></header>`;
const loadDays = id => !fs.existsSync(`data/${id}`) ? [] :
  fs.readdirSync(`data/${id}`).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
    .map(f => ({ ...JSON.parse(fs.readFileSync(`data/${id}/${f}`, "utf8")), date: f.slice(0, 10) }))
    .filter(d => d.headlines?.length);

// root: 이 페이지에서 카테고리 폴더까지 상대 경로, path: 사이트 기준 이 페이지 경로
function renderDay(day, cat, root, path) {
  const home = homeOf(path);
  const list = day.headlines.map((h, i) => `<li><a href="${esc(safeUrl(h.link))}" target="_blank" rel="noopener noreferrer"><span class="n">${i + 1}</span><span class="t">${esc(h.title)}<small class="hs">${esc(h.source)}${h.pub ? " · " + hhmm(h.pub) : ""}${h.n > 1 ? ` · <b>${h.n}곳 보도</b>` : ""}${h.summary ? "<br>" + esc(h.summary) : ""}</small></span></a></li>`).join("\n");
  return `${head(`${cat.name} 헤드라인 ${dotDate(day.date)}`, day.headlines.slice(0, 3).map(h => h.title).join(" · "), path)}${appbar(home, `${cat.name} 헤드라인`, `${root}archive/`, "지난 호", "☰")}
<main class="wrap"><section class="top">
  <span class="eyebrow">${dotDate(day.date)} · ${day.headlines.length} headlines</span>
  <h1>${esc(cat.name)} <em>headlines</em></h1>
  <nav class="t3" aria-label="헤드라인"><h2>최근 24시간 · 많이 보도된 순 · 언론사 RSS</h2><ol>
${list}
  </ol></nav>
  <p class="note">수집 ${esc(day.collected ?? day.date)} (KST). 제목을 누르면 언론사 기사로 이동합니다. 투자 등 중요한 판단 전에는 원문을 확인하세요.</p>
</section></main>`;
}

fs.rmSync("dist", { recursive: true, force: true });
fs.cpSync("public", "dist", { recursive: true }); // 아이콘·공유 이미지·매니페스트
const write = (p, s) => { fs.mkdirSync(`dist/${p}`, { recursive: true }); fs.writeFileSync(`dist/${p}index.html`, s); };

for (const cat of CATS) {
  const days = cat.days = loadDays(cat.id);
  if (!days.length) continue;
  const p = `${cat.id}/`;
  write(p, renderDay(days[0], cat, "", p));
  for (const d of days) write(`${p}${d.date}/`, renderDay(d, cat, "../", `${p}${d.date}/`));
  const list = days.map(d => `<li><a href="../${d.date}/"><span class="n">${d.headlines.length}</span><span class="t">${dotDate(d.date)} · ${esc(d.headlines[0].title)}</span></a></li>`).join("\n");
  write(`${p}archive/`, `${head(`${cat.name} 지난 호`, `${cat.name} 헤드라인 ${days.length}개 호 모음`, `${p}archive/`)}${appbar("../../", `${cat.name} 헤드라인`, "../", "최신 호", "↗")}
<main class="wrap"><section class="top">
  <span class="eyebrow">Archive · ${days.length} issues</span>
  <h1>지난 <em>issues</em></h1>
  <nav class="t3" aria-label="날짜별 목록"><h2>${days.length}개 호 · 숫자는 기사 수</h2><ol>
${list}
  </ol></nav>
</section></main>`);
}

// 메인(hub.html): LP 슬리브 가로 캐러셀 → 누르면 헤드라인이 바퀴처럼 휘는 목록
const SRC_COLOR = ["video", "trend", "tips", "news"];
const hubData = CATS.map(c => {
  const d = c.days[0];
  const srcs = d ? [...new Set(d.headlines.map(h => h.source))] : [];
  return {
    id: c.id, name: c.name, color: c.color, date: d ? dotDate(d.date) : "", link: c.link,
    verdict: d ? d.headlines[0].title : "준비 중이에요. 곧 소식을 모아 올게요.",
    items: !d ? [] : d.headlines.map(h => ({ t: h.title, tag: `${h.source} · ${hhmm(h.pub)}${h.n > 1 ? ` · ${h.n}곳 보도` : ""}`, c: SRC_COLOR[srcs.indexOf(h.source) % 4], href: safeUrl(h.link), ext: true })),
  };
});
const crate = (c, i) => `<button class="crate" style="--c:var(--${c.color})" aria-label="${esc(c.name)} 뉴스${c.items.length ? ` ${c.items.length}건` : " (준비 중)"}">
  <span class="disc" aria-hidden="true"><span class="lbl">${esc(c.name)}</span></span>
  <span class="sleeve"><span class="meta"><span>No. ${String(i + 1).padStart(2, "0")}</span><span>${c.items.length ? `${c.items.length}건` : "SOON"}</span></span><span class="hole" aria-hidden="true"></span><b class="name">${esc(c.name)}</b></span>
</button>`;
write("", fs.readFileSync("hub.html", "utf8")
  .replace("{{HEAD}}", () => head("뉴스 모아보기", `${hubData.find(c => c.date)?.date ?? ""} 오늘의 ${CATS.map(c => c.name).join("·")} 헤드라인`, ""))
  .replace("{{UPDATED}}", () => CATS.flatMap(c => c.days[0]?.collected ?? []).sort().at(-1) ?? "")
  .replace("{{CRATES}}", () => hubData.map(crate).join(""))
  .replace("{{DATA}}", () => JSON.stringify(hubData).replace(/</g, "\\u003c")));

console.log("dist/ 생성:", CATS.map(c => `${c.id} ${c.days.length}개 호`).join(", "));
