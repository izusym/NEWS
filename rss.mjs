// node rss.mjs → data/<카테고리>/YYYY-MM-DD.json (언론사 RSS 헤드라인, Claude 사용 안 함)
import fs from "node:fs";

// AI타임스는 HTTPS 인증서 체인이 불완전해 Node fetch가 거부 → HTTP로 받음 (제목·링크만 쓰는 공개 RSS)
const FEEDS = {
  ai: [["AI타임스", "http://www.aitimes.com/rss/allArticle.xml"], ["인공지능신문", "https://www.aitimes.kr/rss/allArticle.xml"]],
  economy: [["한국경제", "https://www.hankyung.com/feed/economy"], ["연합뉴스", "https://www.yna.co.kr/rss/economy.xml"]],
  stock: [["한국경제", "https://www.hankyung.com/feed/finance"], ["연합뉴스", "https://www.yna.co.kr/rss/market.xml"]],
};
const MAX = 12, HOURS = 24;

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&(lt|gt|quot|apos|#39|nbsp|amp);/g, (_, e) => ({ lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " ", amp: "&" })[e])
  .replace(/\s+/g, " ").trim();
const tag = (xml, t) => decode(xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");

// 시간대 없는 "2026-10-14 18:23:32"(AI타임스 등)는 한국 시간으로 해석
const toIso = s => { const t = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d/.test(s) ? s.replace(" ", "T") + "+09:00" : s); return isNaN(t) ? "" : new Date(t).toISOString(); };

// ponytail: 정규식 RSS 파서, 쓰는 피드(한경·연합)가 RSS 2.0 형식이라 충분. 다른 형식 피드를 넣으면 파서 라이브러리 고려
function parse(xml, source) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([it]) => ({
    title: tag(it, "title"), link: tag(it, "link"), source,
    pub: toIso(tag(it, "pubDate") || tag(it, "dc:date")),
    summary: tag(it, "description").slice(0, 110),
  })).filter(x => x.title && /^https?:\/\//.test(x.link));
}

async function fetchFeed([source, url]) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 news-hub" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(r.status);
    return parse(await r.text(), source);
  } catch (e) { console.warn(`${source} ${url} 실패: ${e.message}`); return []; }
}

{
  const now = new Date(), kst = new Date(now.getTime() + 9 * 3600e3);
  const date = kst.toISOString().slice(0, 10), collected = kst.toISOString().slice(0, 16).replace("T", " ");
  for (const [cat, feeds] of Object.entries(FEEDS)) {
    const seen = new Set();
    const items = (await Promise.all(feeds.map(fetchFeed))).flat()
      .filter(x => { const p = Date.parse(x.pub); return !p || now - p < HOURS * 3600e3; })
      .sort((a, b) => (Date.parse(b.pub) || 0) - (Date.parse(a.pub) || 0))
      .filter(x => { const k = x.title.replace(/[\s\p{P}\p{S}]/gu, "").slice(0, 20); return !seen.has(k) && seen.add(k); })
      .slice(0, MAX);
    if (!items.length) { console.warn(`${cat}: 헤드라인 없음, 건너뜀`); continue; }
    fs.mkdirSync(`data/${cat}`, { recursive: true });
    fs.writeFileSync(`data/${cat}/${date}.json`, JSON.stringify({ date, collected, verdict: items[0].title, headlines: items }, null, 1));
    console.log(`${cat}: ${items.length}건`);
  }
}
