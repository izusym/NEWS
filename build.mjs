// node build.mjs → dist/ (/: 최신 호, /YYYY-MM-DD/: 각 호, /archive/: 목록)
import fs from "node:fs";

const TAGC = { "AI NEWS": "news", "AI VIDEO": "video", "AI IMAGE": "video", "AI TIPS": "tips", "AI TREND": "trend" };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]);

function fsz(kw) {
  const w = [...kw].reduce((a, ch) => a + (ch.codePointAt(0) > 127 ? 1 : 0.58), 0);
  return Math.trunc(Math.max(30, Math.min(54, 380 / w)));
}

const MOTIFS = {
  argon: '<g style="stroke:var(--c);fill:none;stroke-width:2" opacity=".55"><circle cx="470" cy="150" r="46"/><circle cx="470" cy="150" r="82"/><circle cx="470" cy="150" r="118"/></g><circle cx="470" cy="150" r="12" style="fill:var(--c)"/><circle cx="548" cy="118" r="6" style="fill:var(--c)"/><circle cx="410" cy="226" r="6" style="fill:var(--c)"/>',
  wonder: '<g style="fill:var(--c)"><rect x="420" y="190" width="34" height="90" rx="4" opacity=".4"/><rect x="466" y="140" width="34" height="140" rx="4" opacity=".65"/><rect x="512" y="80" width="34" height="200" rx="4"/></g><path d="M410 296H560" style="stroke:var(--c);stroke-width:3"/>',
  sora: '<g style="fill:none;stroke:var(--c);stroke-width:3"><rect x="410" y="90" width="170" height="120" rx="10"/><path d="M410 120h170M410 180h170" opacity=".5"/></g><path d="M470 125l50 25-50 25z" style="fill:var(--c)"/><path d="M420 250h150" style="stroke:var(--c);stroke-width:3;stroke-dasharray:6 8"/>',
  play: '<rect x="440" y="70" width="120" height="210" rx="18" style="fill:none;stroke:var(--c);stroke-width:3"/><g style="fill:var(--c)"><rect x="458" y="100" width="84" height="22" rx="5" opacity=".9"/><rect x="458" y="134" width="60" height="22" rx="5" opacity=".55"/><rect x="458" y="168" width="84" height="22" rx="5" opacity=".35"/></g><text x="500" y="252" text-anchor="middle" style="fill:var(--c);font:700 22px var(--mono)">&lt;/&gt;</text>',
  char: '<g style="fill:var(--c)"><circle cx="480" cy="130" r="38" opacity=".9"/><path d="M420 260c0-44 26-70 60-70s60 26 60 70z" opacity=".55"/></g><path d="M552 90l-26 26m0-26l26 26" style="stroke:var(--c);stroke-width:5;stroke-linecap:round"/>',
  code: '<g style="fill:none;stroke:var(--c);stroke-width:3"><path d="M430 270c40-10 60-130 100-150s40 40 50 30" /></g><g style="fill:var(--c)"><circle cx="430" cy="270" r="9"/><circle cx="530" cy="120" r="9"/><circle cx="580" cy="150" r="9" opacity=".5"/></g><text x="420" y="92" style="fill:var(--c);font:700 20px var(--mono)">f(t)=½gt²</text>',
  kakao: '<g style="fill:var(--c)"><path d="M420 90h150a24 24 0 0 1 24 24v76a24 24 0 0 1-24 24h-90l-36 30v-30h-24a24 24 0 0 1-24-24v-76a24 24 0 0 1 24-24z" opacity=".9"/></g><g style="fill:var(--ill-bg)"><circle cx="460" cy="152" r="9"/><circle cx="500" cy="152" r="9"/><circle cx="540" cy="152" r="9"/></g><path d="M470 250l22 22 40-44" style="fill:none;stroke:var(--c);stroke-width:5;stroke-linecap:round;stroke-linejoin:round"/>',
  bundle: '<g style="fill:var(--c)"><rect x="430" y="90" width="140" height="44" rx="8" opacity=".95"/><rect x="430" y="146" width="140" height="44" rx="8" opacity=".65"/><rect x="430" y="202" width="140" height="44" rx="8" opacity=".4"/></g>',
  task: '<g style="fill:none;stroke:var(--c);stroke-width:3"><rect x="430" y="80" width="150" height="190" rx="12"/></g><g style="fill:var(--c)"><circle cx="458" cy="122" r="8"/><circle cx="458" cy="166" r="8" opacity=".6"/><circle cx="458" cy="210" r="8" opacity=".35"/><rect x="480" y="118" width="80" height="8" rx="4"/><rect x="480" y="162" width="64" height="8" rx="4" opacity=".6"/><rect x="480" y="206" width="72" height="8" rx="4" opacity=".35"/></g>',
  feed: '<g style="fill:none;stroke:var(--c);stroke-width:3"><path d="M420 120h160M420 180h160M420 240h160" opacity=".4"/></g><g style="fill:var(--c)"><circle cx="520" cy="120" r="12"/><circle cx="460" cy="180" r="12"/><circle cx="540" cy="240" r="12"/></g>',
};

const svg = (kind, kw, sub) =>
  `<svg viewBox="0 0 640 360" role="img" aria-label="${esc(kw)} 키워드 일러스트" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">` +
  `<rect width="640" height="360" style="fill:var(--ill-bg)"/><rect width="640" height="360" style="fill:var(--c);opacity:.12"/>${MOTIFS[kind] ?? MOTIFS.feed}` +
  `<text x="32" y="188" style="fill:var(--ill-fg);font:400 ${fsz(kw)}px var(--display)">${esc(kw)}</text>` +
  `<text x="34" y="226" style="fill:var(--c);font:700 20px var(--mono)">${esc(sub)}</text></svg>`;

const dotDate = d => `${d.replaceAll("-", ".")} (${"일월화수목금토"[new Date(d + "T00:00:00Z").getUTCDay()]})`;
// 매일 루틴이 만드는 JSON이라 http(s) 링크만 허용
const safeUrl = u => (/^https?:\/\//i.test(u) ? u : "#");

function renderDay(day, tpl, root, home) {
  const { cards } = day;
  const top3 = (day.top3 ?? [1, 2, 3]).filter(n => cards[n - 1]).map(n =>
    `<li><a href="#c${n}"><span class="n">${n}</span><span class="t">${esc(cards[n - 1].title)}</span></a></li>`).join("\n");
  const cardHtml = cards.map((c, i) => {
    const n = i + 1;
    if (c.lines.length !== 5) console.warn(`${day.date} #${n}: 요약이 ${c.lines.length}줄`);
    if (!MOTIFS[c.kind]) console.warn(`${day.date} #${n}: 모르는 kind "${c.kind}" → feed로 대체`);
    const srcs = c.src.map(([name, url]) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`).join(" · ");
    return `<article class="card ${TAGC[c.tag] ?? "news"}" id="c${n}">
  <header class="ch"><span class="rank" aria-label="${n}위">${n}</span><span class="tag">${esc(c.tag)}</span><time class="date">${esc(c.date)}</time></header>
  <h2>${esc(c.title)}</h2>
  <figure>${svg(c.kind, c.kw, c.sub)}<figcaption>${esc(c.credit)}</figcaption></figure>
  <ul class="sum">${c.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
  <p class="why"><b>왜 중요?</b> ${esc(c.why)}</p>
  <p class="src"><b>출처</b> ${srcs}</p>
</article>`;
  }).join("\n");
  const note = day.note ?? `오늘은 ${cards.length}건입니다.`;
  return tpl
    .replaceAll("{{TITLE}}", `AI 카드뉴스 ${day.date}`).replaceAll("{{ROOT}}", root).replaceAll("{{HOME}}", home)
    .replace("{{DOTDATE}}", dotDate(day.date)).replace("{{VERDICT}}", esc(day.verdict))
    .replace("{{NOTE}}", esc(note)).replace("{{COLLECTED}}", esc(day.collected ?? day.date))
    .replace("{{TOP3}}", () => top3).replace("{{CARDS}}", () => cardHtml);
}

// 카테고리: data/<id>/YYYY-MM-DD.json 이 있으면 활성, 없으면 "준비 중" 탭
// ponytail: 다른 카테고리도 지금은 AI 카드뉴스와 같은 JSON 형식을 가정
const CATS = [
  { id: "ai", name: "AI", color: "news" },
  { id: "economy", name: "경제", color: "tips" },
  { id: "tech", name: "IT·과학", color: "trend" },
  { id: "world", name: "세계", color: "video" },
];

const tpl = fs.readFileSync("template.html", "utf8");
const head = title => tpl.slice(0, tpl.indexOf("<main")).replace("{{TITLE}}", title);
const loadDays = id => !fs.existsSync(`data/${id}`) ? [] :
  fs.readdirSync(`data/${id}`).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
    .map(f => ({ ...JSON.parse(fs.readFileSync(`data/${id}/${f}`, "utf8")), date: f.slice(0, 10) }));

fs.rmSync("dist", { recursive: true, force: true });
const write = (p, s) => { fs.mkdirSync(`dist/${p}`, { recursive: true }); fs.writeFileSync(`dist/${p}index.html`, s); };

for (const cat of CATS) {
  const days = cat.days = loadDays(cat.id);
  if (!days.length) continue;
  const p = `${cat.id}/`;
  write(p, renderDay(days[0], tpl, "", "../"));
  for (const d of days) write(`${p}${d.date}/`, renderDay(d, tpl, "../", "../../"));
  const list = days.map(d => `<li><a href="../${d.date}/"><span class="n">${d.cards.length}</span><span class="t">${dotDate(d.date)} · ${esc(d.verdict)}</span></a></li>`).join("\n");
  write(`${p}archive/`, `${head(`${cat.name} 뉴스 지난 호`)}<main class="wrap"><section class="top">
  <span class="eyebrow">Daily ${esc(cat.name)} News · <a href="../../">메인</a> · <a href="../">최신 호</a></span>
  <h1>지난 호</h1>
  <nav class="t3" aria-label="날짜별 목록"><h2>${days.length}개 호 · 숫자는 기사 수</h2><ol>
${list}
  </ol></nav>
</section></main>`);
}

// 메인(hub.html): LP 슬리브 가로 캐러셀 → 누르면 뉴스가 바퀴처럼 휘는 목록
const hubData = CATS.map(c => {
  const d = c.days[0];
  return {
    id: c.id, name: c.name, color: c.color, date: d ? dotDate(d.date) : "",
    verdict: d?.verdict ?? "준비 중이에요. 곧 소식을 모아 올게요.",
    items: d ? d.cards.map((x, i) => ({ t: x.title, tag: x.tag, c: TAGC[x.tag] ?? "news", href: `${c.id}/#c${i + 1}` })) : [],
  };
});
const crate = (c, i) => `<button class="crate" style="--c:var(--${c.color})" aria-label="${esc(c.name)} 뉴스${c.items.length ? ` ${c.items.length}건` : " (준비 중)"}">
  <span class="disc" aria-hidden="true"><span class="lbl">${esc(c.name)}</span></span>
  <span class="sleeve"><span class="meta"><span>No. ${String(i + 1).padStart(2, "0")}</span><span>${c.items.length ? `${c.items.length}건` : "SOON"}</span></span><span class="hole" aria-hidden="true"></span><b class="name">${esc(c.name)}</b></span>
</button>`;
write("", fs.readFileSync("hub.html", "utf8")
  .replace("{{HEAD}}", () => head("뉴스 모아보기"))
  .replace("{{CRATES}}", () => hubData.map(crate).join(""))
  .replace("{{DATA}}", () => JSON.stringify(hubData).replace(/</g, "\\u003c")));

console.log("dist/ 생성:", CATS.map(c => `${c.id} ${c.days.length}개 호`).join(", "));
