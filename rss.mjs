// node rss.mjs → data/<카테고리>/YYYY-MM-DD.json (언론사 RSS 헤드라인, Claude 사용 안 함)
import fs from "node:fs";

// [이름, 주소, (선택) 제목 키워드 필터]. 구글 뉴스 검색 RSS는 여러 언론사 기사를 한 번에 줌(실제 언론사 이름은 <source>에서 읽음)
// AI타임스는 HTTPS 인증서 체인이 불완전해 Node fetch가 거부 → HTTP로 받음 (제목·링크만 쓰는 공개 RSS)
const GN = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
const AI_KW = /(?<![A-Za-z])AI(?![A-Za-z])|인공지능|GPT|LLM|챗봇|오픈AI|앤트로픽|제미나이|딥러닝|생성형/i;
const STOCK_KW = /증시|코스피|코스닥|주가|종목|상장|공모|증권|외국인|기관|ETF|나스닥/;
const FEEDS = {
  ai: [
    ["AI타임스", "http://www.aitimes.com/rss/allArticle.xml"],
    ["인공지능신문", "https://www.aitimes.kr/rss/allArticle.xml"],
    ["전자신문", "https://rss.etnews.com/Section901.xml", AI_KW],
    ["ZDNet Korea", "https://zdnet.co.kr/feed", AI_KW],
  ],
  economy: [
    ["한국경제", "https://www.hankyung.com/feed/economy"],
    ["연합뉴스", "https://www.yna.co.kr/rss/economy.xml"],
    ["서울경제", "https://www.sedaily.com/rss/Economy"],
    ["헤럴드경제", "https://biz.heraldcorp.com/rss/google/economy"],
    ["뉴시스", "https://www.newsis.com/RSS/economy.xml"],
    ["경향신문", "https://www.khan.co.kr/rss/rssdata/economy_news.xml"],
    ["한겨레", "https://www.hani.co.kr/rss/economy/"],
    ["동아일보", "https://rss.donga.com/economy.xml"],
    ["SBS", "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02"],
    ["JTBC", "https://fs.jtbc.co.kr/RSS/economy.xml"],
  ],
  stock: [
    ["한국경제", "https://www.hankyung.com/feed/finance"],
    ["연합뉴스", "https://www.yna.co.kr/rss/market.xml"],
    ["머니투데이", "https://rss.mt.co.kr/mt_news.xml", STOCK_KW],
    ["조선비즈", "https://biz.chosun.com/arc/outboundfeeds/rss/?outputType=xml", STOCK_KW],
    ["구글 뉴스", GN("증시 OR 코스피 OR 코스닥 when:1d")],
  ],
};
const MAX = 12, HOURS = 24;

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&(lt|gt|quot|apos|#39|nbsp|amp);/g, (_, e) => ({ lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " ", amp: "&" })[e])
  .replace(/&#(x?)([0-9a-f]+);/gi, (_, x, n) => String.fromCodePoint(parseInt(n, x ? 16 : 10)))
  .replace(/\s+/g, " ").trim();
const tag = (xml, t) => decode(xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");

// 시간대 없는 "2026-10-14 18:23:32"(AI타임스 등)는 한국 시간으로 해석
const toIso = s => { const t = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d/.test(s) ? s.replace(" ", "T") + "+09:00" : s); return isNaN(t) ? "" : new Date(t).toISOString(); };

// ponytail: 정규식 RSS 파서, 지금 쓰는 피드가 모두 RSS 2.0이라 충분. Atom 피드를 넣으면 파서 라이브러리 고려
function parse(xml, source, kw) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([it]) => {
    const gn = tag(it, "source"); // 구글 뉴스: 실제 언론사 이름, 설명은 링크 HTML뿐이라 버림
    let title = tag(it, "title");
    if (gn && title.endsWith(` - ${gn}`)) title = title.slice(0, -gn.length - 3);
    return { feed: source, title, link: tag(it, "link"), source: gn || source, pub: toIso(tag(it, "pubDate") || tag(it, "dc:date")), summary: gn ? "" : tag(it, "description").slice(0, 110) };
  }).filter(x => x.title && /^https?:\/\//.test(x.link) && (!kw || kw.test(x.title)));
}

async function fetchFeed([source, url, kw]) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 news-hub" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(r.status);
    return parse(await r.text(), source, kw);
  } catch (e) { console.warn(`${source} ${url} 실패: ${e.message}`); return []; }
}

// 관심도 = 같은 소식을 다룬 채널 수 → 언론사 수 순 (RSS엔 조회수가 없어서 보도량으로 대신함)
// 채널 수를 먼저 보는 이유: 구글 뉴스 한 채널 안의 군소 지역지 수십 곳이 순위를 뒤집지 않게
// 제목을 두 글자씩 쪼개(바이그램) 겹치는 비율이 SAME 이상이면 같은 소식, 이미 뽑은 것과 NEAR 이상이면 비슷한 소식이라 건너뜀
// ponytail: 전체 쌍 비교 O(n²), 탭당 수백 건이라 1초 안. 수천 건이 되면 키워드 색인으로 후보를 줄일 것
const SAME = 0.45, NEAR = 0.3, SKIP = /^\[(인사|게시판|부고|포토|사진|날씨|운세)\]/;
const bigrams = t => {
  const s = t.replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  const b = new Set();
  for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2));
  return b;
};
const overlap = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.min(a.size, b.size); };

function rankByCoverage(items, max) {
  const xs = items.filter(x => !SKIP.test(x.title)).map(x => ({ x, b: bigrams(x.title) })).filter(o => o.b.size >= 8);
  const groups = xs.map(o => {
    const same = xs.filter(p => overlap(o.b, p.b) >= SAME);
    return { o, same, ch: new Set(same.map(p => p.x.feed)).size, n: new Set(same.map(p => p.x.source)).size };
  }).sort((a, b) => b.ch - a.ch || b.n - a.n || (Date.parse(b.o.x.pub) || 0) - (Date.parse(a.o.x.pub) || 0));
  const used = new Set(), picked = [], out = [];
  for (const { o, same, n } of groups) {
    if (used.has(o) || picked.some(b => overlap(o.b, b) >= NEAR)) continue;
    same.forEach(p => used.add(p));
    picked.push(o.b);
    out.push({ ...o.x, n });
    if (out.length >= max) break;
  }
  return out;
}

// 자체 점검: 같은 소식 두 건은 하나로 묶여 2곳 보도, 다른 소식은 따로
{
  const t = (title, source) => ({ title, source, feed: source, pub: "" });
  const r = rankByCoverage([t("금융사 침해사고 발생 총 16곳 약 10만건 유출", "A"), t("금융권 해킹 피해 총 16곳서 약 10만 건 유출", "B"), t("코스피 6거래일 연속 내려 6천선 턱걸이", "C")], 5);
  if (r.length !== 2 || r[0].n !== 2 || r[1].n !== 1) throw new Error("rankByCoverage 점검 실패: " + JSON.stringify(r.map(x => x.n)));
}

const now = new Date(), kst = new Date(now.getTime() + 9 * 3600e3);
const date = kst.toISOString().slice(0, 10), collected = kst.toISOString().slice(0, 16).replace("T", " ");
for (const [cat, feeds] of Object.entries(FEEDS)) {
  const seen = new Set();
  const fresh = (await Promise.all(feeds.map(fetchFeed))).flat()
    .filter(x => { const p = Date.parse(x.pub); return !p || now - p < HOURS * 3600e3; })
    .filter(x => { const k = x.title.replace(/[\s\p{P}\p{S}]/gu, "").slice(0, 20); return !seen.has(k) && seen.add(k); });
  const items = rankByCoverage(fresh, MAX).map(({ feed, ...x }) => x);
  if (!items.length) { console.warn(`${cat}: 헤드라인 없음, 건너뜀`); continue; }
  fs.mkdirSync(`data/${cat}`, { recursive: true });
  fs.writeFileSync(`data/${cat}/${date}.json`, JSON.stringify({ date, collected, headlines: items }, null, 1));
  console.log(`${cat}: ${items.length}건, 언론사 ${new Set(items.map(x => x.source)).size}곳`);
}
