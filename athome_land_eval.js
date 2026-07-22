const fs = require("fs");

const CITY_ROWS = [
  ["shinjuku-city", "新宿区", "13104"],
  ["setagaya-city", "世田谷区", "13112"],
  ["suginami-city", "杉並区", "13115"],
  ["nerima-city", "練馬区", "13120"],
  ["adachi-city", "足立区", "13121"],
  ["katsushika-city", "葛飾区", "13122"],
  ["edogawa-city", "江戸川区", "13123"],
  ["ota-city", "大田区", "13111"],
  ["koto-city", "江東区", "13108"],
  ["shinagawa-city", "品川区", "13109"],
  ["meguro-city", "目黒区", "13110"],
  ["kita-city", "北区", "13117"],
  ["itabashi-city", "板橋区", "13119"],
  ["hachioji-city", "八王子市", "13201"],
  ["machida-city", "町田市", "13209"],
  ["chofu-city", "調布市", "13208"],
  ["fuchu-city", "府中市", "13206"],
  ["kodaira-city", "小平市", "13211"]
];

const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  "accept-language": "ja,en-US;q=0.9,en;q=0.8"
};

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function textify(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#034;|&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/\r/g, "")
    .replace(/\n\s*\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parsePrice(text) {
  const raw = String(text || "").replace(/,/g, "");
  const oku = (raw.match(/(\d+(?:\.\d+)?)\s*億/) || [])[1];
  const manAfterOku = (raw.match(/億\s*(\d+(?:\.\d+)?)\s*万/) || [])[1];
  const man = (raw.match(/(^|[^\d])(\d+(?:\.\d+)?)\s*万/) || [])[2];
  const value = (oku ? Number(oku) * 10000 : 0) + (manAfterOku ? Number(manAfterOku) : oku ? 0 : man ? Number(man) : 0);
  return value ? Math.round(value) : 0;
}

function firstNumber(text) {
  const match = String(text || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function field(block, label, nextLabels) {
  const start = block.indexOf(label);
  if (start < 0) return "";
  let rest = block.slice(start + label.length);
  let end = rest.length;
  for (const next of nextLabels) {
    const idx = rest.indexOf(next);
    if (idx >= 0 && idx < end) end = idx;
  }
  return clean(rest.slice(0, end));
}

function lineAfter(lines, label) {
  const idx = lines.findIndex((line) => line === label || line.startsWith(label));
  if (idx < 0) return "";
  return clean(lines[idx + 1] || "");
}

function parseWalk(traffic) {
  const direct = String(traffic || "").match(/徒歩\s*(\d+)\s*分/);
  if (direct) return Number(direct[1]);
  const busWalk = String(traffic || "").match(/停歩\s*(\d+)\s*分/);
  if (busWalk) return Math.min(25, Number(busWalk[1]) + 15);
  return 20;
}

function parseStation(traffic) {
  const quoted = String(traffic || "").match(/[「『]([^」』]+)[」』]\s*駅?/);
  if (quoted) return quoted[1].replace(/駅$/, "");
  const plain = String(traffic || "").match(/([^\s/]+)駅/);
  return plain ? plain[1] : "最寄駅";
}

function inferLandFields(block) {
  const road = field(block, "接道状況", ["おすすめコメント", "土地", "お気に入り", "詳細をみる"]);
  const rights = field(block, "権利", ["土地面積"]);
  const privateRoad = field(block, "私道負担面積", ["建ぺい率/容積率"]);
  const comment = clean((block.match(/おすすめコメント\s+(.+?)(?:お気に入り|詳細をみる|物件を閉じる)/) || [])[1] || "");
  const all = `${block} ${comment}`;

  const roadWidth = firstNumber(road);
  const landRight = /定期借地/.test(rights) ? "fixedLeasehold" : /借地|賃借/.test(rights) ? "leasehold" : /共有/.test(rights) ? "shared" : /所有/.test(rights) ? "ownership" : "unknown";
  const roadOwnership = /私道|有/.test(privateRoad) ? "private" : /公道/.test(road) || /なし|－|-/.test(privateRoad) ? "public" : "unknown";
  const roadDirection = /南/.test(road) || /南道路/.test(all) ? "south" : /北/.test(road) ? "north" : "unknown";
  const landShape = /不整形|旗竿|路地状|変形/.test(all) ? "irregular" : /整形地/.test(all) ? "regular" : "unknown";
  const setback = /セットバック.*要|要セットバック/.test(all) ? "needed" : "unknown";
  const rebuildable = /再建築不可/.test(all) ? "no" : /建築不可|建物の建築はできません/.test(all) ? "no" : "unknown";
  const waterSewer = /上水道|下水道/.test(all) ? "ready" : "unknown";
  const hazardRisk = /浸水|洪水|土砂災害/.test(all) ? "high" : "unknown";
  const soilRisk = /擁壁|高低差|崖|傾斜/.test(all) ? "medium" : "unknown";
  const boundary = /境界確定|確定測量/.test(all) ? "fixed" : "unknown";

  return { road, roadWidth, landRight, roadOwnership, roadDirection, landShape, setback, rebuildable, waterSewer, hazardRisk, soilRisk, boundary, comment };
}

function parseListings(html, cityName, cityCode, slug) {
  const text = textify(html);
  const chunks = text.split("物件を閉じる").filter((chunk) => chunk.includes("土地面積"));
  const rows = [];

  for (const chunk of chunks) {
    const compact = clean(chunk);
    const lines = chunk.split("\n").map(clean).filter(Boolean);
    const titleIndex = lines.findIndex((line) => line.includes(cityName) && line.includes("住宅用地"));
    const title = titleIndex >= 0 ? lines[titleIndex] : clean((compact.match(new RegExp(`${cityName} .+? 住宅用地`)) || [])[0] || `${cityName} 土地`);
    const priceLine = lines.slice(Math.max(0, titleIndex + 1), titleIndex + 8).find((line) => /万円/.test(line)) || "";
    const price = parsePrice(priceLine);
    const area = firstNumber(lineAfter(lines, "土地面積"));
    const address = lineAfter(lines, "所在地");
    const traffic = lineAfter(lines, "交通");
    const ratios = lineAfter(lines, "建ぺい率/容積率").match(/(\d+)\s*%\s*\/\s*(\d+)\s*%/);
    const urlId = (chunk.match(/\/tochi\/(\d{10})\//) || [])[1] || "";

    if (!price || !area || !address) continue;
    rows.push({
      sourceCity: cityName,
      city: cityCode,
      areaCode: "13",
      slug,
      title,
      listingPrice: price,
      landArea: area,
      address: address.startsWith("東京都") ? address : `東京都${address}`,
      traffic,
      stationName: parseStation(traffic),
      walkMinutes: parseWalk(traffic),
      coverageRatio: ratios ? Number(ratios[1]) : 0,
      floorAreaRatio: ratios ? Number(ratios[2]) : 0,
      url: urlId ? `https://www.athome.co.jp/tochi/${urlId}/` : `https://www.athome.co.jp/tochi/tokyo/${slug}/list/`,
      ...inferLandFields(compact)
    });
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.address}|${row.listingPrice}|${row.landArea}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addAdjustment(list, category, label, percent) {
  if (!percent) return;
  list.push({ category, label, percent: Math.round(percent * 10) / 10 });
}

function sumAdjustments(list, category) {
  return Math.round(list.filter((item) => item.category === category).reduce((sum, item) => sum + item.percent, 0) * 10) / 10;
}

function clampNegativeAdjustment(value, cap) {
  return Math.max(Number(value || 0), -cap);
}

function applyPercent(price, percent) {
  return price * (1 + Number(percent || 0) / 100);
}

function buildLandAdjustments(row) {
  const list = [];
  addAdjustment(list, "物件条件", "接道方位", row.roadDirection === "south" ? 1.5 : 0);
  addAdjustment(list, "悪条件", "再建築不可", row.rebuildable === "no" ? -30 : 0);
  addAdjustment(list, "悪条件", "再建築制限あり", row.rebuildable === "limited" ? -12 : 0);
  addAdjustment(list, "悪条件", "セットバック要", row.setback === "needed" ? -7 : 0);
  addAdjustment(list, "悪条件", "接道4m未満", row.roadWidth > 0 && row.roadWidth < 4 ? -8 : 0);
  addAdjustment(list, "悪条件", "私道負担あり", row.roadOwnership === "private" ? -5 : 0);
  addAdjustment(list, "悪条件", "不整形地", row.landShape === "irregular" ? -10 : 0);
  addAdjustment(list, "悪条件", "借地権", row.landRight === "leasehold" ? -24 : 0);
  addAdjustment(list, "悪条件", "定期借地権", row.landRight === "fixedLeasehold" ? -30 : 0);
  addAdjustment(list, "悪条件", "共有持分・特殊権利", row.landRight === "shared" ? -12 : 0);
  addAdjustment(list, "悪条件", "境界未確定", row.boundary === "unfixed" ? -3 : 0);
  addAdjustment(list, "悪条件", "上下水道未整備", row.waterSewer === "none" ? -5 : 0);
  addAdjustment(list, "悪条件", "高いハザードリスク", row.hazardRisk === "high" ? -8 : 0);
  addAdjustment(list, "悪条件", "土壌・擁壁リスク中", row.soilRisk === "medium" ? -3 : 0);
  addAdjustment(list, "悪条件", "土壌・擁壁リスク高", row.soilRisk === "high" ? -8 : 0);
  return list;
}

async function fetchText(url) {
  const slug = (url.match(/tokyo\/([^/]+)\/list/) || [])[1];
  const cachePath = slug ? `athome_cache/${slug}.html` : "";
  if (cachePath && fs.existsSync(cachePath)) {
    const cached = fs.readFileSync(cachePath, "utf8");
    if (cached.length > 100000 && !cached.includes("認証にご協力ください")) return cached;
  }
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  if (!res.ok || text.includes("認証にご協力ください")) {
    throw new Error(`${res.status} ${url}`);
  }
  return text;
}

async function valueRow(row) {
  const params = new URLSearchParams({
    propertyType: "land",
    area: row.areaCode,
    city: row.city,
    station: row.stationName,
    walkMinutes: String(row.walkMinutes),
    targetArea: String(row.landArea),
    address: row.address
  });
  const res = await fetch(`http://localhost:3001/api/real-estate-cases?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || String(res.status));

  const contractBaseUnitPrice = Number(data.averageUnitPrice || 0);
  const contractBasePrice = contractBaseUnitPrice * row.landArea;
  const adjustments = buildLandAdjustments(row);
  const conditionAdjustmentTotal = sumAdjustments(adjustments, "物件条件");
  const badConditionRaw = sumAdjustments(adjustments, "悪条件");
  const badConditionCapped = clampNegativeAdjustment(badConditionRaw, 35);
  const finalPrice = applyPercent(applyPercent(contractBasePrice, conditionAdjustmentTotal) * 1.16, badConditionCapped);
  return {
    ...row,
    caseCount: data.caseCount || 0,
    contractBasePrice: Math.round(contractBasePrice),
    appraisalPrice: Math.round(finalPrice),
    diffPct: Math.round(((finalPrice - row.listingPrice) / row.listingPrice) * 1000) / 10,
    conditionAdjustmentTotal,
    badConditionCapped
  };
}

function toMan(value) {
  return `${Math.round(value).toLocaleString("ja-JP")}万`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "／").replace(/\n/g, " ");
}

async function main() {
  const collected = [];
  const fetchErrors = [];
  for (const [slug, cityName, cityCode] of CITY_ROWS) {
    try {
      const html = await fetchText(`https://www.athome.co.jp/tochi/tokyo/${slug}/list/`);
      collected.push(...parseListings(html, cityName, cityCode, slug).slice(0, 30));
    } catch (error) {
      fetchErrors.push(`${cityName}: ${error.message}`);
    }
  }

  const selected = collected.slice(0, 90);
  const valued = [];
  const valuationErrors = [];
  for (const row of selected) {
    try {
      valued.push(await valueRow(row));
    } catch (error) {
      valuationErrors.push(`${row.title}: ${error.message}`);
    }
  }

  const avg = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0) / Math.max(rows.length, 1);
  const md = [
    `# At home 東京都内土地 ${valued.length}件 査定結果`,
    "",
    `取得件数: ${selected.length} / 査定成功: ${valued.length}`,
    fetchErrors.length ? `取得エラー: ${fetchErrors.join(" / ")}` : "取得エラー: なし",
    valuationErrors.length ? `査定エラー: ${valuationErrors.join(" / ")}` : "査定エラー: なし",
    "",
    `平均差: ${Math.round(avg(valued, "diffPct") * 10) / 10}%`,
    "",
    "| No | 市区 | 物件名 | 所在地 | 交通 | 面積 | 掲載額 | 査定額 | 差分 | 権利 | 私道 | 接道 | 形状 | 再建築 | セットバック | URL |",
    "|---:|---|---|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|",
    ...valued.map((row, index) => [
      index + 1,
      row.sourceCity,
      escapeCell(row.title),
      escapeCell(row.address),
      escapeCell(row.traffic),
      `${row.landArea}㎡`,
      toMan(row.listingPrice),
      toMan(row.appraisalPrice),
      `${row.diffPct}%`,
      row.landRight,
      row.roadOwnership,
      row.roadWidth ? `${row.roadWidth}m ${row.roadDirection}` : row.roadDirection,
      row.landShape,
      row.rebuildable,
      row.setback,
      row.url
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"))
  ].join("\n");

  fs.writeFileSync("athome_land_eval_land.md", md, "utf8");
  console.log(JSON.stringify({
    fetched: collected.length,
    selected: selected.length,
    valued: valued.length,
    fetchErrors,
    valuationErrors,
    avgDiffPct: Math.round(avg(valued, "diffPct") * 10) / 10,
    overListing: valued.filter((row) => row.diffPct > 0).length,
    targetBand: valued.filter((row) => row.diffPct <= -8 && row.diffPct >= -12).length,
    lowMoreThan20: valued.filter((row) => row.diffPct < -20).length,
    sample: valued.slice(0, 5).map((row) => ({
      city: row.sourceCity,
      title: row.title,
      listingPrice: row.listingPrice,
      appraisalPrice: row.appraisalPrice,
      diffPct: row.diffPct
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
