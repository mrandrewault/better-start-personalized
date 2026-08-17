import Parser from "rss-parser";
import fs from "fs";
import path from "path";

const parser = new Parser({
  timeout: 9000,
  headers: {"User-Agent": "BetterStart/2.0"},
  customFields: {item: [["media:content", "mediaContent"], ["media:thumbnail", "mediaThumbnail"]]}
});
const dataPath = name => path.join(process.cwd(), "data", name);
const load = name => JSON.parse(fs.readFileSync(dataPath(name), "utf8"));
const blockedTerms = Object.values(load("content-policy.json")).flat();
const policyText = value => ` ${String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;

function plain(value = "") {
  return value.replace(/<[^>]+>/g, " ").replace(/&\w+;/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeTitle(value = "") {
  return plain(value).toLowerCase().replace(/\b(the|a|an|and|or|but|to|of|for|in|on|at|with|from)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}
function canonicalUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "source", "output"].forEach(key => url.searchParams.delete(key));
    url.hostname = url.hostname.replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return `${url.hostname}${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ""}`;
  } catch { return value.replace(/\/$/, ""); }
}
function imageFor(item) {
  const html = item.content || item["content:encoded"] || "";
  return item.enclosure?.url || item.mediaContent?.$?.url || item.mediaThumbnail?.$?.url || html.match(/<img[^>]+src=["']([^"']+)/i)?.[1] || null;
}
function itemText(item) { return `${item.title || ""} ${item.contentSnippet || ""} ${item.content || ""}`.toLowerCase(); }
function isDisallowed(item) {
  const value = policyText(`${item.title || ""} ${item.summary || ""} ${item.contentSnippet || ""} ${item.source || ""} ${item.section || ""}`);
  return blockedTerms.some(term => value.includes(policyText(term)));
}
function hasBadMood(value) {
  return /killed|deadly|fatal|crash|unsafe|controvers|war|attack|crisis|disaster|outrage|scandal|cancer|dies?\b|death|threat|fear|horrific|tariffs?|banned|terrible|abuse|neglect|euthan|injur|defeat|worsen|\bworst\b/i.test(value);
}
function isJoyful(item) {
  const value = `${item.title || ""} ${item.summary || ""}`;
  return /discover|new|beautiful|guide|best|love|return|release|photo|album|art|music|food|travel|space|nature|design|book|film|restor|celebrat|rescue|record|garden|recipe|festival|museum|wins?\b|victory|comeback|advance|adopt|reunited|kindness|community|uplifting|inspir|opens?|achievement|breakthrough|volunteer|conservation|recovery|success|helps?|creates?|invent/i.test(value) && !hasBadMood(value);
}
function isSpecialistWorthwhile(item) {
  const value = `${item.title || ""} ${item.summary || ""}`;
  return /profile|interview|explainer|guide|design|history|archive|craft|studio|maker|founder|company|business|market|finance|style|fashion|collection|book|author|library|museum|yoga|movement|fitness|garden|plant|workshop|repair|restor|car|automotive|boat|sail|maritime|train|aviation|team|player|baseball|tennis|football|soccer/i.test(value) && !hasBadMood(value);
}
function isFreshLocal(item) {
  if (!item.date) return true;
  // Specialist magazines are often valuable well beyond the daily-news cycle.
  // Their evergreen craft, history and enthusiast pieces get a longer shelf.
  if (item.sourcePack) return (Date.now() - new Date(item.date)) / 864e5 <= 400;
  const evergreenSources = new Set(["NPR Music", "Criterion", "NYT Arts", "NYT Books", "Guardian Science", "Guardian Culture", "Dezeen", "Eater", "NASA"]);
  if (evergreenSources.has(item.source)) return true;
  return (Date.now() - new Date(item.date)) / 864e5 <= 45;
}
function isGoodNews(item) {
  const value = `${item.title || ""} ${item.summary || ""}`;
  return /discover|beautiful|love|return|restor|celebrat|rescue|breakthrough|success|wins?\b|record|opens?|reun|reviv|saved?|found/i.test(value) && isJoyful(item);
}
function classifyGeography(item, localPlaces = []) {
  const value = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  const isPlaceList = /\b(best|top|favorite|favourite|guide|where to eat|where to stay|restaurants?|cafes?|coffee shops?|bakeries|donut shops?|things to do)\b[\s\S]{0,90}\b(near|in|around|at)\b/i.test(value);
  if (!isPlaceList) return "neutral";
  if (localPlaces.some(place => place && value.includes(place))) return "local";
  return "wanderlust";
}
function score(item, source, taste) {
  const text = itemText(item); let value = (source.quality || 5) * 5, hits = 0, noHits = 0;
  for (const raw of taste.yes) if (text.includes(raw.toLowerCase())) { value += 8; if (++hits >= 7) break; }
  for (const raw of taste.no) if (text.includes(raw.toLowerCase())) { value -= 24; noHits++; }
  const hours = item.isoDate ? (Date.now() - new Date(item.isoDate)) / 36e5 : 24;
  value += hours <= 6 ? 10 : hours <= 24 ? 6 : hours <= 48 ? 2 : -Math.min(12, hours / 24);
  if (/kindness|community|rescue|breakthrough|discovery|restored|conservation|volunteer|inspiring|uplifting/i.test(text)) value += 12;
  if (/you won't believe|internet is freaking|shocking|what happened next/i.test(item.title || "")) value -= 15;
  return {score: Math.round(value), interestHits: hits, noHits};
}
const adjacentSignals = {
  "music": ["art", "film", "culture", "audio", "design"],
  "sports": ["fitness", "health", "outdoor", "people"],
  "food": ["travel", "local", "culture", "design"],
  "science": ["nature", "technology", "engineering", "space"],
  "nature": ["outdoor", "animals", "travel", "science"],
  "animals": ["nature", "outdoor", "people"],
  "movies": ["film", "culture", "music", "art"],
  "books": ["ideas", "culture", "history", "art"],
  "business": ["money", "technology", "design", "people"],
  "design": ["art", "architecture", "photography", "style"],
  "travel": ["food", "outdoor", "local", "culture"],
  "gaming": ["technology", "design", "music", "art"],
  "family": ["local", "books", "animals", "outdoor"],
  "health": ["fitness", "sports", "outdoor", "science"]
};
function personalize(item, interests = []) {
  if (!interests.length) return {...item, personalFit:"editorial", personalHits:0};
  const haystack = policyText(`${item.title} ${item.summary} ${item.source} ${item.section}`);
  const stop = new Set(["things","stories","discoveries","ideas","together","especially","good"]);
  const roots = interests.flatMap(term => String(term).toLowerCase().split(/\s+|\+|\//)).map(word => word.replace(/[^a-z0-9-]/g,"" )).filter(word => word.length > 3 && !stop.has(word));
  const directTerms = [...new Set([...interests, ...roots])];
  const direct = directTerms.filter(term => haystack.includes(policyText(term))).length;
  const neighbors = [...new Set(roots.flatMap(root => adjacentSignals[root] || []))];
  const adjacent = neighbors.filter(term => haystack.includes(policyText(term))).length;
  return {...item, score:item.score + Math.min(42, direct * 11) + Math.min(18, adjacent * 4), personalFit:direct ? "direct" : adjacent ? "adjacent" : "editorial", personalHits:direct};
}
function formatFor(item, index) {
  if (item.videoId) return "video";
  if (item.image && index % 7 === 0) return "feature";
  if (item.image && (/photography|art \+ design/i.test(item.section) || index % 3 === 1)) return "visual";
  if (!item.image || (item.summary || "").length < 90) return "blurb";
  return "article";
}
function unique(items) {
  const urls = new Set(), titles = new Set(), output = [];
  for (const item of items) {
    const url = canonicalUrl(item.url), title = normalizeTitle(item.title);
    if (!url || !title || urls.has(url) || titles.has(title)) continue;
    urls.add(url); titles.add(title); output.push({...item, canonicalUrl: url, normalizedTitle: title});
  }
  return output;
}

// A greedy magazine editor: every choice is judged by how much it improves the
// current page, with diminishing returns for repeated sources/topics/formats.
function compose(candidates, count, seed = {}, random = Math.random) {
  const chosen = [], sourceCounts = {...seed.sources}, topicCounts = {...seed.topics}, formatCounts = {...seed.formats}, geoCounts = {local:0,wanderlust:0}, wanderlustCap = Math.max(1, Math.floor(count * .2));
  const pool = [...candidates];
  while (chosen.length < count && pool.length) {
    let winner = 0, best = -Infinity;
    pool.forEach((item, index) => {
      const recent = chosen.slice(-10);
      const sourcePenalty = (sourceCounts[item.source] || 0) * 10 + (recent.some(previous => previous.source === item.source) ? 500 : 0);
      const topicPenalty = (topicCounts[item.section] || 0) * 6 + (chosen.slice(-2).some(previous => previous.section === item.section) ? 30 : 0);
      const formatPenalty = (formatCounts[item.format] || 0) * 8;
      // Prefer stories that bring real photography, artwork or video texture.
      // Text-only pieces still make the edition, but must win on substance.
      const visualBonus = item.image ? 22 : -9;
      const serendipityBonus = item.interestHits === 0 && chosen.length > 3 ? 5 : 0;
      const moodBonus = /discover|new|beautiful|guide|best|love|return|release|photo|album/i.test(`${item.title} ${item.summary}`) ? 4 : 0;
      const geographyBonus = item.geoClass === "local" ? 20 : item.geoClass === "wanderlust" ? (geoCounts.wanderlust < wanderlustCap ? 6 : -90) : 0;
      const compositionScore = item.score - sourcePenalty - topicPenalty - formatPenalty + visualBonus + serendipityBonus + moodBonus + geographyBonus + random() * 14;
      if (compositionScore > best) { best = compositionScore; winner = index; }
    });
    const [item] = pool.splice(winner, 1); chosen.push(item);
    sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
    topicCounts[item.section] = (topicCounts[item.section] || 0) + 1;
    formatCounts[item.format] = (formatCounts[item.format] || 0) + 1;
    if (item.geoClass === "local" || item.geoClass === "wanderlust") geoCounts[item.geoClass]++;
  }
  return chosen;
}
function seededRandom(value = "better-start") {
  let state = 2166136261;
  for (let index = 0; index < value.length; index++) state = Math.imul(state ^ value.charCodeAt(index), 16777619);
  return () => { state += 0x6D2B79F5; let result = state; result = Math.imul(result ^ result >>> 15, result | 1); result ^= result + Math.imul(result ^ result >>> 7, result | 61); return ((result ^ result >>> 14) >>> 0) / 4294967296; };
}
function activateSourcePacks(interests, packs) {
  if (!interests.length) return [];
  const words = new Set(interests.flatMap(value => String(value).toLowerCase().split(/\s+|\+|\//)).map(value => value.replace(/[^a-z0-9-]/g, "")).filter(value => value.length > 3));
  return packs.map(pack => {
    const hits = pack.signals.reduce((total, signal) => total + (interests.some(interest => interest.includes(signal) || signal.includes(interest)) || words.has(signal) ? 1 : 0), 0);
    return {...pack, hits};
  }).filter(pack => pack.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 4);
}

async function sharedVideoSources() {
  const fallback = load("video-sources.json"), url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return fallback;
  try { const response = await fetch(url, {method:"POST", headers:{authorization:`Bearer ${token}`,"content-type":"application/json"}, body:JSON.stringify(["GET","betterstart:sources"]), cache:"no-store"}); const value = (await response.json()).result; return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
async function loadReaderVideos(avoid = new Set()) {
  const videoSources = await sharedVideoSources();
  const results = await Promise.allSettled(videoSources.map(async source => {
    const url = source.type === "playlist" ? `https://www.youtube.com/feeds/videos.xml?playlist_id=${source.id}` : `https://www.youtube.com/feeds/videos.xml?channel_id=${source.id}`;
    const feed = await parser.parseURL(url);
    return (feed.items || []).slice(0, 12).map(item => { const videoId = item.id?.split(":").pop() || item.link?.match(/[?&]v=([^&]+)/)?.[1]; return {title:plain(item.title),url:item.link,summary:"",date:item.isoDate||item.pubDate||null,source:source.name,section:source.category === "music" ? "MUSIC" : source.category === "art" ? "ART + DESIGN" : source.category === "animals" ? "ANIMALS + JOY" : "PEOPLE + JOY",image:videoId?`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`:null,score:70,interestHits:3,noHits:0,videoId,format:"video"}; });
  }));
  const items=[]; results.forEach(result=>{if(result.status==="fulfilled")items.push(...result.value);});
  return unique(items.filter(item=>item.videoId&&!avoid.has(item.videoId)&&!isDisallowed(item)));
}

export async function GET(request) {
  const params = new URL(request.url).searchParams, random = seededRandom(params.get("visit") || String(Math.floor(Date.now() / 72e5))), avoidVideos = new Set((params.get("avoid") || "").split(",").filter(Boolean)), localPlaces = (params.get("places") || "").split("|").map(value => value.trim().toLowerCase()).filter(Boolean).slice(0, 20), interests = (params.get("interests") || "").split("|").map(value => value.trim().toLowerCase()).filter(Boolean).slice(0, 48);
  const taste = load("taste.json"), baseSources = load("sources.json"), activePacks = activateSourcePacks(interests, load("source-packs.json")), specialistSources = activePacks.flatMap(pack => pack.sources.map(source => ({...source, pack:pack.id, packLabel:pack.label}))), sources = [...baseSources, ...specialistSources];
  const results = await Promise.allSettled(sources.map(async source => {
    const feed = await parser.parseURL(source.url);
    return (feed.items || []).slice(0, 40).map((item, index) => {
      const scored = score(item, source, taste);
      const story = {title: plain(item.title) || "Untitled", url: item.link || "#", summary: plain(item.contentSnippet || item.content || ""), date: item.isoDate || item.pubDate || null, source: source.name, section: source.section, image: imageFor(item), sourcePack:source.pack || null, sourcePackLabel:source.packLabel || null, ...scored, score:scored.score + (source.pack ? 18 : 0)};
      return {...story, geoClass: classifyGeography(story, localPlaces), format: formatFor(story, index)};
    });
  }));
  let all = [];
  results.forEach(result => { if (result.status === "fulfilled") all.push(...result.value); });
  all = unique(all.filter(item => item.score > 18 && !isDisallowed(item) && (isJoyful(item) || (item.sourcePack && isSpecialistWorthwhile(item))) && isFreshLocal(item)).map(item => personalize(item, interests)).sort((a, b) => b.score - a.score));

  // One shared registry across every page region makes duplicates impossible.
  const usedUrls = new Set(), usedTitles = new Set();
  const claim = items => items.filter(item => {
    const url = canonicalUrl(item.url), title = normalizeTitle(item.title);
    if (usedUrls.has(url) || usedTitles.has(title)) return false;
    usedUrls.add(url); usedTitles.add(title); return true;
  });
  const brightPool = all.filter(item => /PEOPLE|ANIMALS|PROGRESS|AROUND AMERICA/.test(item.section) || isGoodNews(item));
  const tickerStories = claim(compose(brightPool, 8, {}, random));
  const ribbonFavorite = tickerStories[0] || null;
  const favoriteSelection = claim(compose(brightPool.filter(item => !usedUrls.has(canonicalUrl(item.url))), 6, {}, random));
  const goodNews = claim(compose(all.filter(isGoodNews), 1, {}, random))[0] || null;
  const videoPool = await loadReaderVideos(avoidVideos);
  const media = claim(compose(videoPool, 20, {}, random));
  const importantPool = all.filter(item => ["NASA", "Guardian Science", "Science Breakthroughs", "Technology for Good", "Nature Restored"].includes(item.source));
  const important = claim(compose(importantPool, 3, {}, random));
  if (important.length < 3) {
    const backfillPool = all.filter(item => (!usedUrls.has(canonicalUrl(item.url)) && !usedTitles.has(normalizeTitle(item.title))) && /SCIENCE|NATURE|TECH|PROGRESS|PEOPLE|ANIMALS|OUTDOOR/i.test(item.section || ""));
    important.push(...claim(compose(backfillPool, 3 - important.length, {}, random)));
  }
  const galleryPool = all.filter(item => !usedUrls.has(canonicalUrl(item.url)) && !usedTitles.has(normalizeTitle(item.title)));
  let gallery;
  if (interests.length) {
    const direct = compose(galleryPool.filter(item => item.personalFit === "direct"), 91, {}, random);
    const directKeys = new Set(direct.map(item => canonicalUrl(item.url)));
    const adjacent = compose(galleryPool.filter(item => item.personalFit === "adjacent" && !directKeys.has(canonicalUrl(item.url))), 28, {}, random);
    const selectedKeys = new Set([...direct, ...adjacent].map(item => canonicalUrl(item.url)));
    const editorial = compose(galleryPool.filter(item => !selectedKeys.has(canonicalUrl(item.url))), 21, {}, random);
    const personalizedPool = [];
    while (direct.length || adjacent.length || editorial.length) {
      personalizedPool.push(...direct.splice(0, 13), ...adjacent.splice(0, 4), ...editorial.splice(0, 3));
    }
    const backfill = galleryPool.filter(item => !new Set(personalizedPool.map(story => canonicalUrl(story.url))).has(canonicalUrl(item.url)));
    gallery = claim([...personalizedPool, ...compose(backfill, 140 - personalizedPool.length, {}, random)].slice(0, 140));
  } else gallery = claim(compose(galleryPool, 140, {}, random));
  const serendipityPool = all.filter(item => item.noHits === 0 && !usedUrls.has(canonicalUrl(item.url)) && !usedTitles.has(normalizeTitle(item.title)));
  const serendipity = claim(compose(serendipityPool, 60, {}, random));

  return Response.json({generatedAt: new Date().toISOString(), edition: Math.floor(Date.now() / 72e5), personalized:!!interests.length, composition:{direct:65,adjacent:20,editorial:15}, activeSourcePacks:activePacks.map(pack => ({id:pack.id,label:pack.label,hits:pack.hits})), tickerStories, ribbonFavorite, goodNews, favorites: favoriteSelection, media, gallery, important, serendipity, sourceStatus: {total: sources.length, specialist:specialistSources.length, successful: results.filter(result => result.status === "fulfilled").length}}, {headers: {"Cache-Control": "no-store"}});
}
