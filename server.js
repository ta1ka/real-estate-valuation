require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(express.json());
app.use(express.static("public"));

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let text;
  let data = null;
  try {
    response = await fetch(url, { signal: controller.signal });
    text = await response.text();
  } finally {
    clearTimeout(timer);
  }
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = null;
  }
  return { response, text, data };
}

const PREFECTURES = {
  北海道: "01", 青森県: "02", 岩手県: "03", 宮城県: "04", 秋田県: "05",
  山形県: "06", 福島県: "07", 茨城県: "08", 栃木県: "09", 群馬県: "10",
  埼玉県: "11", 千葉県: "12", 東京都: "13", 神奈川県: "14", 新潟県: "15",
  富山県: "16", 石川県: "17", 福井県: "18", 山梨県: "19", 長野県: "20",
  岐阜県: "21", 静岡県: "22", 愛知県: "23", 三重県: "24", 滋賀県: "25",
  京都府: "26", 大阪府: "27", 兵庫県: "28", 奈良県: "29", 和歌山県: "30",
  鳥取県: "31", 島根県: "32", 岡山県: "33", 広島県: "34", 山口県: "35",
  徳島県: "36", 香川県: "37", 愛媛県: "38", 高知県: "39", 福岡県: "40",
  佐賀県: "41", 長崎県: "42", 熊本県: "43", 大分県: "44", 宮崎県: "45",
  鹿児島県: "46", 沖縄県: "47"
};

const MUNICIPALITIES = {
  千代田区: "13101", 中央区: "13102", 港区: "13103", 新宿区: "13104",
  文京区: "13105", 台東区: "13106", 墨田区: "13107", 江東区: "13108",
  品川区: "13109", 目黒区: "13110", 大田区: "13111", 世田谷区: "13112",
  渋谷区: "13113", 中野区: "13114", 杉並区: "13115", 豊島区: "13116",
  北区: "13117", 荒川区: "13118", 板橋区: "13119", 練馬区: "13120",
  足立区: "13121", 葛飾区: "13122", 江戸川区: "13123",
  横浜市鶴見区: "14101", 横浜市神奈川区: "14102", 横浜市西区: "14103",
  横浜市中区: "14104", 横浜市南区: "14105", 横浜市保土ケ谷区: "14106",
  横浜市磯子区: "14107", 横浜市金沢区: "14108", 横浜市港北区: "14109",
  横浜市戸塚区: "14110", 横浜市港南区: "14111", 横浜市旭区: "14112",
  横浜市緑区: "14113", 横浜市瀬谷区: "14114", 横浜市栄区: "14115",
  横浜市泉区: "14116", 横浜市青葉区: "14117", 横浜市都筑区: "14118",
  横浜市: "14100", 川崎市: "14130", さいたま市: "11100",
  千葉市: "12100", 名古屋市: "23100", 京都市: "26100",
  大阪市: "27100", 神戸市: "28100", 福岡市: "40130"
};

const HIGH_VALUE_LOCALITY_FACTORS = {
  白金: 1.2,
  白金台: 1.22,
  高輪: 1.18,
  三田: 1.14,
  南麻布: 1.2,
  元麻布: 1.21,
  麻布十番: 1.2,
  広尾: 1.22,
  神宮前: 1.2,
  松濤: 1.2,
  南平台: 1.18,
  代官山: 1.17,
  恵比寿西: 1.16,
  恵比寿南: 1.16,
  上原: 1.14,
  富ケ谷: 1.12,
  元代々木町: 1.1,
  南青山: 1.18,
  西麻布: 1.17
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true, port: PORT });
});

function toNumber(value) {
  if (value === undefined || value === null) return 0;
  return Number(String(value).replace(/[^\d.]/g, ""));
}

function normalizeType(type) {
  if (!type) return "other";
  if (type.includes("中古マンション")) return "mansion";
  if (type.includes("宅地") || type.includes("土地")) return "land";
  return "other";
}

function matchesPropertyType(item, propertyType) {
  const type = String(item.Type || "");
  const isMansionRoom = type.includes("中古マンション");
  const isLandBuilding = type.includes("土地と建物");
  const isLandOnly = (type.includes("宅地") || type.includes("土地")) && !isLandBuilding && !isMansionRoom;

  if (propertyType === "mansion") return isMansionRoom;
  if (propertyType === "land") return isLandOnly;
  if (propertyType === "landBuilding") return isLandBuilding;
  return normalizeType(type) === propertyType;
}

function inferCodesFromAddress(address) {
  const prefecture = Object.keys(PREFECTURES).find((name) => address.includes(name));
  const municipality = Object.keys(MUNICIPALITIES)
    .sort((a, b) => b.length - a.length)
    .find((name) => address.includes(name));

  return {
    prefecture,
    municipality,
    area: prefecture ? PREFECTURES[prefecture] : "",
    city: municipality ? MUNICIPALITIES[municipality] : ""
  };
}

function mergeAddressCodes(primaryAddress, fallbackAddress = "") {
  const primary = inferCodesFromAddress(primaryAddress || "");
  if (primary.city) return primary;

  const fallback = inferCodesFromAddress(fallbackAddress || "");
  return {
    prefecture: primary.prefecture || fallback.prefecture,
    municipality: primary.municipality || fallback.municipality,
    area: primary.area || fallback.area,
    city: primary.city || fallback.city
  };
}

function normalizeText(value) {
  return String(value || "")
    .replace(/[ 　]/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/が/g, "ケ")
    .replace(/之/g, "の");
}

function extractLocalityFromAddress(address, prefecture = "", municipality = "") {
  let text = normalizeText(address);
  if (!text) return "";

  for (const token of [prefecture, municipality]) {
    if (token) {
      text = text.replace(normalizeText(token), "");
    }
  }

  return text
    .replace(/[0-9０-９]+丁目.*/u, "")
    .replace(/[0-9０-９]+番地?.*/u, "")
    .replace(/[0-9０-９]+号.*/u, "")
    .replace(/[^一-龠ぁ-んァ-ヶケの]/gu, "");
}

function getLocalityFactor(locality) {
  const normalized = normalizeText(locality);
  for (const [name, factor] of Object.entries(HIGH_VALUE_LOCALITY_FACTORS)) {
    if (normalized.includes(normalizeText(name))) return factor;
  }
  return 1;
}

function getArea(item, propertyType) {
  if (propertyType === "mansion") {
    return toNumber(item.FloorArea || item.TotalFloorArea || item.Area);
  }
  if (propertyType === "landBuilding") {
    return toNumber(item.TotalFloorArea || item.FloorArea || item.Area);
  }
  return toNumber(item.Area);
}

function parsePeriod(period) {
  const text = String(period || "");
  const year = Number((text.match(/(\d{4})年/) || [])[1] || 0);
  const quarter = Number((text.match(/第(\d)四半期/) || [])[1] || 1);
  return { year, quarter, order: year * 4 + quarter };
}

function getCaseWeight(item, latestOrder) {
  const { order } = parsePeriod(item.period);
  const quartersAgo = Math.max(latestOrder - order, 0);
  return 1 / (1 + quartersAgo * 0.18);
}

function getSimilarityWeight(item) {
  const score = Number(item.similarityScore || 0);
  if (score <= 10) return 3.5;
  if (score <= 25) return 2.7;
  if (score <= 45) return 2.0;
  if (score <= 70) return 1.3;
  return 0.65;
}

function parseWalkMinutes(value) {
  const text = String(value || "");
  if (!text) return 0;
  if (text.includes("30分")) return 30;
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function parseBuildingYear(value) {
  const text = String(value || "");
  if (!text) return 0;
  const western = text.match(/(\d{4})年?/);
  if (western) return Number(western[1]);
  const eras = [
    { name: "令和", start: 2018 },
    { name: "平成", start: 1988 },
    { name: "昭和", start: 1925 },
    { name: "大正", start: 1911 }
  ];
  for (const era of eras) {
    const match = text.match(new RegExp(`${era.name}(\\d+)年?`));
    if (match) return era.start + Number(match[1]);
  }
  return 0;
}

function getBuildingAge(buildingYear) {
  const year = parseBuildingYear(buildingYear);
  return year ? Math.max(new Date().getFullYear() - year, 0) : 0;
}

function normalizeFloorPlan(value) {
  const text = String(value || "").replace(/\s/g, "");
  if (!text) return "unknown";
  if (/^studio$/i.test(text)) return "studio";
  if (/^oneK$/i.test(text)) return "oneK";
  if (/^oneDK$/i.test(text)) return "oneDK";
  if (/^oneLDK$/i.test(text)) return "oneLDK";
  if (/^twoKDK$/i.test(text)) return "twoKDK";
  if (/^twoLDK$/i.test(text)) return "twoLDK";
  if (/^threeKDK$/i.test(text)) return "threeKDK";
  if (/^threeLDK$/i.test(text)) return "threeLDK";
  if (/ワンルーム|1R|１Ｒ|1ROOM/i.test(text)) return "studio";
  if (/1K|１Ｋ/.test(text)) return "oneK";
  if (/1DK|１ＤＫ/.test(text)) return "oneDK";
  if (/1LDK|１ＬＤＫ/.test(text)) return "oneLDK";
  if (/2K|２Ｋ|2DK|２ＤＫ/.test(text)) return "twoKDK";
  if (/2LDK|２ＬＤＫ/.test(text)) return "twoLDK";
  if (/3K|３Ｋ|3DK|３ＤＫ/.test(text)) return "threeKDK";
  if (/3LDK|３ＬＤＫ/.test(text)) return "threeLDK";
  if (/4LDK|４ＬＤＫ|fourLDK/.test(text)) return "fourLDK";
  if (/5LDK|５ＬＤＫ|fiveLDK/.test(text)) return "fiveLDK";
  if (/6LDK|６ＬＤＫ|sixLDK/.test(text)) return "sixLDK";
  if (/7LDK|７ＬＤＫ|8LDK|８ＬＤＫ|9LDK|９ＬＤＫ|fourPlus|sevenPlus/.test(text)) return "sevenPlus";
  return "unknown";
}

function floorPlanGroup(value) {
  const plan = normalizeFloorPlan(value);
  const groups = {
    studio: 1, oneK: 1, oneDK: 2, oneLDK: 2,
    twoKDK: 3, twoLDK: 3, threeKDK: 4, threeLDK: 4,
    fourLDK: 5, fiveLDK: 6, sixLDK: 7, sevenPlus: 8
  };
  return groups[plan] || 0;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, ratio) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function removeUnitPriceOutliers(cases, propertyType = "mansion") {
  const minimumCases = propertyType === "mansion" ? 20 : 15;
  if (cases.length < minimumCases) {
    return { cases, removedCount: 0 };
  }

  const unitPrices = cases.map((item) => item.unitPrice).filter((value) => value > 0);
  if (unitPrices.length < minimumCases) {
    return { cases, removedCount: 0 };
  }

  const q1 = quantile(unitPrices, 0.25);
  const q3 = quantile(unitPrices, 0.75);
  const iqr = q3 - q1;
  const center = median(unitPrices);
  const multiplier = propertyType === "mansion" ? 2.4 : propertyType === "land" ? 3.2 : 3.6;
  const lower = Math.max(q1 - iqr * multiplier, center * 0.35, 1);
  const upper = Math.max(q3 + iqr * multiplier, center * 1.85);
  const filtered = cases.filter((item) => item.unitPrice >= lower && item.unitPrice <= upper);
  const removedCount = cases.length - filtered.length;
  const removedRatio = cases.length ? removedCount / cases.length : 0;
  const minimumRemaining = propertyType === "mansion" ? 18 : 12;

  return {
    cases: filtered.length >= minimumRemaining && removedRatio <= 0.25 ? filtered : cases,
    removedCount: filtered.length >= minimumRemaining && removedRatio <= 0.25 ? removedCount : 0
  };
}
function splitDistrict(districtName) {
  const text = String(districtName || "");
  const match = text.match(/(.+?)(\d+丁目)$/);
  if (!match) return { district: text, block: "" };
  return { district: match[1], block: match[2] };
}

function isDistrictSimilar(caseDistrict, targetDistrict) {
  const caseText = String(caseDistrict || "");
  const targetText = String(targetDistrict || "");
  if (!caseText || !targetText) return false;
  return caseText.includes(targetText) || targetText.includes(caseText);
}

function isLocalityMatch(caseDistrict, targetLocality) {
  const caseText = normalizeText(splitDistrict(caseDistrict).district);
  const targetText = normalizeText(targetLocality);
  if (!caseText || !targetText) return false;
  return caseText === targetText || caseText.includes(targetText) || targetText.includes(caseText);
}

function isStationMatch(caseStation, targetStation) {
  const caseText = String(caseStation || "").replace(/駅$/, "");
  const targetText = String(targetStation || "").replace(/駅$/, "");
  if (!caseText || !targetText) return false;
  return caseText.includes(targetText) || targetText.includes(caseText);
}

function selectAdaptiveStep(steps, minimumCount = 50, maximumCount = 800) {
  const stepsWithCounts = steps.map((step) => ({
    ...step,
    count: step.pool.length
  }));
  const inRange = stepsWithCounts.filter((step) => step.count >= minimumCount && step.count <= maximumCount);
  if (inRange.length) return inRange[inRange.length - 1];

  const aboveMaximum = stepsWithCounts.filter((step) => step.count > maximumCount);
  if (aboveMaximum.length) return aboveMaximum[aboveMaximum.length - 1];

  return stepsWithCounts.reduce((best, step) => (step.count > best.count ? step : best), stepsWithCounts[0]);
}

function toCase(item, propertyType) {
  const price = toNumber(item.TradePrice);
  const area = getArea(item, propertyType);
  const unitPrice = price && area ? price / area / 10000 : 0;
  const district = splitDistrict(item.DistrictName);
  const stationKey = normalizeText(String(item.NearestStation || "").replace(/駅$/, ""));
  const useKey = normalizeText(item.Use || item.Usage || item.Utilization || "");
  const purposeKey = normalizeText(item.Purpose || "");
  const cityPlanningKey = normalizeText(item.CityPlanning || item.UrbanPlanning || "");
  const landShapeKey = normalizeText(item.LandShape || "");
  const renovationKey = normalizeText(item.Renovation || item.Remodeling || "");
  const structureKey = normalizeStructure(item.Structure);

  return {
    type: item.Type,
    districtName: item.DistrictName,
    ...district,
    districtKey: normalizeText(district.district),
    stationKey,
    nearestStation: item.NearestStation,
    walkMinutes: parseWalkMinutes(item.TimeToNearestStation),
    tradePrice: price,
    area,
    landArea: toNumber(item.Area),
    totalFloorArea: toNumber(item.TotalFloorArea || item.FloorArea),
    unitPrice: Math.round(unitPrice * 10) / 10,
    buildingYear: item.BuildingYear,
    buildingAge: getBuildingAge(item.BuildingYear),
    floorPlan: normalizeFloorPlan(item.FloorPlan),
    structure: structureKey,
    frontage: toNumber(item.Frontage),
    floorAreaRatio: toNumber(item.FloorAreaRatio),
    coverageRatio: toNumber(item.CoverageRatio),
    useKey,
    purposeKey,
    cityPlanningKey,
    landShapeKey,
    renovationKey,
    period: item.Period,
    raw: item
  };
}

function chooseCases(items, propertyType, options) {
  const targetArea = Number(options.targetArea || 0);
  const targetLandArea = Number(options.targetLandArea || 0);
  const targetBuildingAge = Number(options.buildingAge || 0);
  const targetFloorPlan = normalizeFloorPlan(options.floorPlan || "");
  const targetWalkMinutes = Number(options.walkMinutes || 0);
  const stationName = String(options.stationName || "").replace(/駅$/, "");
  const targetDistrict = String(options.targetDistrict || "");
  const targetLocality = String(options.targetLocality || "");
  const localityFactor = Number(options.localityFactor || 1);

  const allCases = items
    .filter((item) => matchesPropertyType(item, propertyType))
    .map((item) => toCase(item, propertyType))
    .filter((item) => item.tradePrice && item.area && item.unitPrice);
  const sameFloorPlanCases = propertyType === "mansion" && targetFloorPlan !== "unknown"
    ? allCases.filter((item) => item.floorPlan === targetFloorPlan)
    : [];
  const sameLocalityCases = targetLocality
    ? allCases.filter((item) => isLocalityMatch(item.districtName, targetLocality))
    : [];
  const sameStationCases = stationName
    ? allCases.filter((item) => isStationMatch(item.nearestStation, stationName))
    : [];
  const sameLocalityStationCases = targetLocality || stationName
    ? allCases.filter((item) =>
      (!targetLocality || isLocalityMatch(item.districtName, targetLocality)) &&
      (!stationName || isStationMatch(item.nearestStation, stationName))
    )
    : [];
  const sameLocalityStationFloorPlanCases = propertyType === "mansion" && targetFloorPlan !== "unknown"
    ? sameLocalityStationCases.filter((item) => item.floorPlan === targetFloorPlan)
    : [];

  const candidateSteps = propertyType === "mansion"
    ? [
        {
          localityMode: "sameMunicipality",
          stationMode: "broad",
          layoutMode: "similarLayout",
          pool: allCases
        },
        {
          localityMode: "sameMunicipality",
          stationMode: "sameStation",
          layoutMode: "similarLayout",
          pool: sameStationCases
        }
      ]
    : [
        {
          localityMode: "sameMunicipality",
          stationMode: "broad",
          layoutMode: "notUsed",
          pool: allCases
        },
        {
          localityMode: "sameMunicipality",
          stationMode: "sameStation",
          layoutMode: "notUsed",
          pool: sameStationCases
        }
      ];

  const selectedStep = selectAdaptiveStep(candidateSteps, 50, 800);
  const selectedPool = selectedStep.pool.length ? selectedStep.pool : allCases;
  const outlierResult = removeUnitPriceOutliers(selectedPool, propertyType);
  let analysisCases = outlierResult.cases;
  if (sameStationCases.length) {
    const stationCaseMap = new Map(analysisCases.map((item) => [`${item.districtName}_${item.period}_${item.area}_${item.tradePrice}`, item]));
    for (const item of sameStationCases) {
      stationCaseMap.set(`${item.districtName}_${item.period}_${item.area}_${item.tradePrice}`, item);
    }
    analysisCases = Array.from(stationCaseMap.values());
  }
  const latestOrder = Math.max(...analysisCases.map((item) => parsePeriod(item.period).order), 0);

  const scoredCases = analysisCases
    .map((item) => {
      const areaWeight = propertyType === "mansion" && targetArea > 0 && targetArea <= 30 ? 85 : 52;
      const areaScore = targetArea
        ? Math.min(Math.abs(item.area - targetArea) / targetArea, 1.5) * areaWeight
        : 0;
      const compactMismatchScore = propertyType === "mansion" && targetArea > 0 && targetArea <= 30 && item.area > 35 ? 28 : 0;
      const caseLandArea = propertyType === "landBuilding" ? toNumber(item.raw?.Area) : 0;
      const landAreaScore = propertyType === "landBuilding" && targetLandArea && caseLandArea
        ? Math.min(Math.abs(caseLandArea - targetLandArea) / targetLandArea, 1.5) * 52
        : 0;
      const ageScore = targetBuildingAge && item.buildingAge
        ? Math.min(Math.abs(item.buildingAge - targetBuildingAge) / Math.max(targetBuildingAge, 1), 1) * 42
        : 0;
      const targetPlanGroup = floorPlanGroup(targetFloorPlan);
      const itemPlanGroup = floorPlanGroup(item.floorPlan);
      const floorPlanScore = propertyType !== "mansion"
        ? 0
        : targetPlanGroup && itemPlanGroup
        ? Math.abs(targetPlanGroup - itemPlanGroup) * 16 + (targetFloorPlan === item.floorPlan ? 0 : 4)
        : 0;
      const walkScore = targetWalkMinutes && item.walkMinutes
        ? Math.min(Math.abs(item.walkMinutes - targetWalkMinutes) / Math.max(targetWalkMinutes, 1), 1.5) * 28
        : 0;
      const stationScore = stationName && String(item.nearestStation || "").includes(stationName)
        ? 0
        : stationName
          ? localityFactor >= 1.12 ? 14 : 8
          : 0;
      const districtScore = targetLocality && isLocalityMatch(item.districtName, targetLocality)
        ? 0
        : targetDistrict
          ? localityFactor >= 1.12 ? 36 : 22
          : 0;
      const recencyScore = (1 - getCaseWeight(item, latestOrder)) * 12;

      return {
        ...item,
        similarityScore: Math.round((areaScore + landAreaScore + compactMismatchScore + ageScore + floorPlanScore + walkScore + stationScore + districtScore + recencyScore) * 10) / 10
      };
    })
    .sort((a, b) => a.similarityScore - b.similarityScore);

  scoredCases.analysisMeta = {
    totalCandidateCount: allCases.length,
    selectedPoolCount: selectedPool.length,
    outlierRemovedCount: outlierResult.removedCount,
    floorPlanFiltered: propertyType === "mansion" && selectedStep.layoutMode === "sameLayout",
    floorPlanCaseCount: sameFloorPlanCases.length,
    localityFiltered: selectedStep.localityMode === "sameLocality",
    localityCaseCount: sameLocalityCases.length,
    stationFiltered: selectedStep.stationMode === "sameStation",
    stationCaseCount: sameStationCases.length,
    usedCaseCount: scoredCases.length,
    localityMode: selectedStep.localityMode,
    stationMode: sameStationCases.length ? "sameStationIncluded" : selectedStep.stationMode,
    layoutMode: selectedStep.layoutMode
  };

  return scoredCases;
}

function normalizeStructure(value) {
  const text = String(value || "");
  if (/RC|ＲＣ|SRC|ＳＲＣ|鉄筋|鉄骨鉄筋/.test(text)) return "rc";
  if (/鉄骨|S造|Ｓ造/.test(text)) return "steel";
  if (/木造|W造|Ｗ造/.test(text)) return "wood";
  return "unknown";
}

function uniqueTopValues(values, limit, minimumCount = 2) {
  const counts = new Map();
  for (const value of values) {
    if (!value || value === "unknown") continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter((entry) => entry[1] >= minimumCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map((entry) => entry[0]);
}

function currentQuarterPeriod() {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}年第${quarter}四半期`;
}

function buildRegressionContext(samples, targetSource, propertyType) {
  const numericSpecs = [
    {
      key: "area",
      include: true,
      value: (source) => Math.log(Math.max(Number(source.area || source.targetArea || 0), 1)) / 5
    },
    {
      key: "buildingAge",
      include: samples.some((item) => Number(item.buildingAge || 0) > 0) || Number(targetSource.buildingAge || 0) > 0,
      value: (source) => Math.min(Math.max(Number(source.buildingAge || 0), 0), 80) / 60
    },
    {
      key: "walkMinutes",
      include: samples.some((item) => Number(item.walkMinutes || 0) > 0) || Number(targetSource.walkMinutes || 0) > 0,
      value: (source) => Math.min(Math.max(Number(source.walkMinutes || 0), 0), 30) / 20
    },
    {
      key: "year",
      include: true,
      value: (source) => {
        const period = parsePeriod(source.period);
        return period.year ? (period.year - 2015) / 10 : 0;
      }
    },
    {
      key: "quarter",
      include: true,
      value: (source) => {
        const period = parsePeriod(source.period);
        return period.quarter ? (period.quarter - 1) / 3 : 0;
      }
    },
    {
      key: "landArea",
      include: propertyType === "landBuilding" || samples.some((item) => Number(item.landArea || 0) > 0) || Number(targetSource.landArea || 0) > 0,
      value: (source) => Math.log(Math.max(Number(source.landArea || 0), 1)) / 5
    },
    {
      key: "totalFloorArea",
      include: samples.some((item) => Number(item.totalFloorArea || 0) > 0) || Number(targetSource.totalFloorArea || 0) > 0,
      value: (source) => Math.log(Math.max(Number(source.totalFloorArea || 0), 1)) / 5
    },
    {
      key: "frontage",
      include: samples.some((item) => Number(item.frontage || 0) > 0) || Number(targetSource.frontage || 0) > 0,
      value: (source) => Math.min(Math.max(Number(source.frontage || 0), 0), 40) / 20
    },
    {
      key: "floorAreaRatio",
      include: samples.some((item) => Number(item.floorAreaRatio || 0) > 0) || Number(targetSource.floorAreaRatio || 0) > 0,
      value: (source) => Math.min(Math.max(Number(source.floorAreaRatio || 0), 0), 800) / 400
    },
    {
      key: "coverageRatio",
      include: samples.some((item) => Number(item.coverageRatio || 0) > 0) || Number(targetSource.coverageRatio || 0) > 0,
      value: (source) => Math.min(Math.max(Number(source.coverageRatio || 0), 0), 100) / 100
    }
  ];

  const categoricalSpecs = [
    {
      key: "district",
      categories: uniqueTopValues(samples.map((item) => item.districtKey).concat(targetSource.districtKey || []), 24, 3),
      value: (source) => source.districtKey || "unknown"
    },
    {
      key: "station",
      categories: uniqueTopValues(samples.map((item) => item.stationKey).concat(targetSource.stationKey || []), 16, 3),
      value: (source) => source.stationKey || "unknown"
    },
    {
      key: "floorPlan",
      categories: uniqueTopValues(samples.map((item) => item.floorPlan).concat(targetSource.floorPlan || []), 12, 2),
      value: (source) => normalizeFloorPlan(source.floorPlan)
    },
    {
      key: "structure",
      categories: uniqueTopValues(samples.map((item) => item.structure).concat(targetSource.structure || []), 4, 2),
      value: (source) => normalizeStructure(source.structure)
    },
    {
      key: "use",
      categories: uniqueTopValues(samples.map((item) => item.useKey), 12, 3),
      value: (source) => source.useKey || "unknown"
    },
    {
      key: "purpose",
      categories: uniqueTopValues(samples.map((item) => item.purposeKey), 12, 3),
      value: (source) => source.purposeKey || "unknown"
    },
    {
      key: "cityPlanning",
      categories: uniqueTopValues(samples.map((item) => item.cityPlanningKey), 10, 3),
      value: (source) => source.cityPlanningKey || "unknown"
    },
    {
      key: "landShape",
      categories: uniqueTopValues(samples.map((item) => item.landShapeKey), 8, 3),
      value: (source) => source.landShapeKey || "unknown"
    },
    {
      key: "renovation",
      categories: uniqueTopValues(samples.map((item) => item.renovationKey), 8, 3),
      value: (source) => source.renovationKey || "unknown"
    }
  ].filter((spec) => spec.categories.length > 0);

  return { numericSpecs, categoricalSpecs };
}

function featureVectorFromContext(source, context) {
  const values = [1];

  for (const spec of context.numericSpecs) {
    if (!spec.include) continue;
    values.push(spec.value(source));
  }

  for (const spec of context.categoricalSpecs) {
    const current = spec.value(source);
    for (const category of spec.categories) {
      values.push(current === category ? 1 : 0);
    }
  }

  return values;
}

function compactFeatureVectorFromContext(source, propertyType) {
  const period = parsePeriod(source.period);
  const values = [
    1,
    Math.log(Math.max(Number(source.area || source.targetArea || 0), 1)) / 5,
    Math.min(Math.max(Number(source.buildingAge || 0), 0), 80) / 60,
    Math.min(Math.max(Number(source.walkMinutes || 0), 0), 30) / 20,
    period.year ? (period.year - 2015) / 10 : 0,
    period.quarter ? (period.quarter - 1) / 3 : 0
  ];

  if (propertyType === "landBuilding" || Number(source.landArea || 0) > 0) {
    values.push(Math.log(Math.max(Number(source.landArea || 0), 1)) / 5);
  }

  if (Number(source.totalFloorArea || 0) > 0) {
    values.push(Math.log(Math.max(Number(source.totalFloorArea || 0), 1)) / 5);
  }

  return values;
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const divisor = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n]);
}

function solveRidgePrediction(samples, targetSource, vectorBuilder, lambda) {
  if (!samples.length) return null;

  const featureCount = vectorBuilder(samples[0]).length;
  if (samples.length < featureCount + 2) return null;

  const xtx = Array.from({ length: featureCount }, () => Array(featureCount).fill(0));
  const xty = Array(featureCount).fill(0);
  const latestOrder = Math.max(...samples.map((row) => parsePeriod(row.period).order), 0);

  for (const item of samples) {
    const x = vectorBuilder({
      ...item,
      structure: item.raw?.Structure
    });
    const y = item.adjustedUnitPrice || item.unitPrice;
    const w = getCaseWeight(item, latestOrder) * getSimilarityWeight(item);
    for (let i = 0; i < featureCount; i += 1) {
      xty[i] += x[i] * y * w;
      for (let j = 0; j < featureCount; j += 1) {
        xtx[i][j] += x[i] * x[j] * w;
      }
    }
  }

  for (let i = 1; i < featureCount; i += 1) xtx[i][i] += lambda;
  const beta = solveLinearSystem(xtx, xty);
  if (!beta) return null;

  const targetX = vectorBuilder(targetSource);
  const rawPrediction = targetX.reduce((sum, value, index) => sum + value * beta[index], 0);
  if (!Number.isFinite(rawPrediction) || rawPrediction <= 0) return null;

  return rawPrediction;
}

function ridgeRegressionPredict(cases, options, weightedUnitPrice, propertyType = "mansion") {
  const samples = cases
    .filter((item) => (item.adjustedUnitPrice || item.unitPrice) && item.area)
    .sort((a, b) => a.similarityScore - b.similarityScore);
  const requiredSamples = propertyType === "mansion" ? 20 : 12;
  if (samples.length < requiredSamples) return null;

  const targetSource = {
    area: options.targetArea,
    landArea: options.targetLandArea,
    totalFloorArea: options.targetBuildingTotalArea || options.targetArea,
    buildingAge: options.buildingAge,
    floorPlan: options.floorPlan,
    walkMinutes: options.walkMinutes,
    structure: options.structure,
    districtKey: normalizeText(options.targetLocality || options.targetDistrict || ""),
    stationKey: normalizeText(String(options.stationName || "").replace(/駅$/, "")),
    period: currentQuarterPeriod()
  };
  const baseUnitPrice =
    weightedUnitPrice ||
    median(samples.map((item) => item.adjustedUnitPrice || item.unitPrice).filter((value) => value > 0));
  if (!baseUnitPrice) return null;

  const fullContext = buildRegressionContext(samples, targetSource, propertyType);
  const fullVectorBuilder = (source) => featureVectorFromContext(source, fullContext);
  const compactVectorBuilder = (source) => compactFeatureVectorFromContext(source, propertyType);
  const lambda = samples.length >= 80 ? 1.5 : 4;
  let rawPrediction = solveRidgePrediction(samples, targetSource, fullVectorBuilder, lambda);
  let method = "ridge";
  if (!rawPrediction) {
    rawPrediction = solveRidgePrediction(samples, targetSource, compactVectorBuilder, Math.max(lambda, 5));
    method = "ridgeCompact";
  }
  if (!rawPrediction) return null;

  const localityFactor = Number(options.localityFactor || 1);
  const lower = baseUnitPrice * (localityFactor >= 1.12 ? 0.55 : 0.6);
  const upper = baseUnitPrice * (localityFactor >= 1.18 ? 1.95 : localityFactor >= 1.12 ? 1.8 : 1.5);
  const prediction = Math.min(Math.max(rawPrediction, lower), upper);

  return {
    unitPrice: Math.round(prediction * 10) / 10,
    rawUnitPrice: Math.round(rawPrediction * 10) / 10,
    sampleCount: samples.length,
    method
  };
}

function buildTargetYears(year, yearsBack, minimumSpan = 5, maximumSpan = 10) {
  const maxYear = Number(year || new Date().getFullYear());
  const requestedSpan = Math.min(Math.max(Number(yearsBack) || minimumSpan, minimumSpan), maximumSpan);
  return Array.from({ length: requestedSpan }, (_, index) => String(maxYear - index));
}

function buildPeriodUnitPriceMap(cases) {
  const periodMap = new Map();

  for (const item of cases) {
    const period = parsePeriod(item.period);
    if (!period.order || !item.unitPrice) continue;
    const current = periodMap.get(period.order) || {
      order: period.order,
      periodLabel: item.period,
      totalUnitPrice: 0,
      count: 0
    };
    current.totalUnitPrice += item.unitPrice;
    current.count += 1;
    periodMap.set(period.order, current);
  }

  return new Map(
    Array.from(periodMap.values())
      .map((row) => ({
        order: row.order,
        periodLabel: row.periodLabel,
        averageUnitPrice: row.count ? row.totalUnitPrice / row.count : 0
      }))
      .filter((row) => row.averageUnitPrice > 0)
      .map((row) => [row.order, row])
  );
}

function applyTimeAdjustment(cases) {
  if (!cases.length) {
    cases.timeAdjustmentMeta = {
      latestAverageUnitPrice: 0,
      latestOrder: 0,
      averageRate: 1
    };
    return cases;
  }

  const latestOrder = Math.max(...cases.map((item) => parsePeriod(item.period).order), 0);
  const periodMap = buildPeriodUnitPriceMap(cases);
  const latestAverageUnitPrice =
    periodMap.get(latestOrder)?.averageUnitPrice ||
    median(cases.map((item) => item.unitPrice).filter((value) => value > 0));

  const adjustedCases = cases.map((item) => {
    const period = parsePeriod(item.period);
    const periodAverageUnitPrice = periodMap.get(period.order)?.averageUnitPrice || item.unitPrice;
    const timeAdjustmentRate =
      periodAverageUnitPrice > 0 && latestAverageUnitPrice > 0
        ? latestAverageUnitPrice / periodAverageUnitPrice
        : 1;

    return {
      ...item,
      adjustedUnitPrice: Math.round(item.unitPrice * timeAdjustmentRate * 10) / 10,
      timeAdjustmentRate: Math.round(timeAdjustmentRate * 1000) / 1000
    };
  });

  adjustedCases.analysisMeta = cases.analysisMeta;
  adjustedCases.timeAdjustmentMeta = {
    latestAverageUnitPrice: Math.round(latestAverageUnitPrice * 10) / 10,
    latestOrder,
    averageRate:
      Math.round(
        adjustedCases.reduce((sum, item) => sum + (item.timeAdjustmentRate || 1), 0) /
          Math.max(adjustedCases.length, 1) *
          1000
      ) / 1000
  };

  return adjustedCases;
}

function shouldExpandCaseWindow(cases, propertyType) {
  if (!cases.length) return true;
  const minimum = propertyType === "mansion" ? 40 : 30;
  if (cases.length < minimum) return true;
  if ((cases.analysisMeta?.usedCaseCount || 0) < minimum) return true;
  return false;
}
function summarizeCases(cases, propertyType, options = {}) {
  const analysisMeta = cases.analysisMeta || {
    totalCandidateCount: 0,
    selectedPoolCount: cases.length,
    outlierRemovedCount: 0,
    floorPlanFiltered: false,
    floorPlanCaseCount: 0,
    localityFiltered: false,
    localityCaseCount: 0,
    stationFiltered: false,
    stationCaseCount: 0,
    usedCaseCount: cases.length,
    localityMode: "sameMunicipality",
    stationMode: "broad",
    layoutMode: propertyType === "mansion" ? "similarLayout" : "notUsed"
  };

  if (!cases.length) {
    return {
      propertyType,
      caseCount: 0,
      averageUnitPrice: null,
      weightedAverageUnitPrice: null,
      regressionUnitPrice: null,
      regressionRawUnitPrice: null,
      regressionSampleCount: 0,
      pricingMethod: "取引事例なし",
      analysisMeta,
      caseScope: options.caseScope || null,
      analysisNote: "条件に合う取引事例がありませんでした。地域、面積、物件種別を確認してください。",
      detectedMarketTrend: "flat",
      detectedLiquidity: "low",
      trend: [],
      cases: []
    };
  }

  const timeAdjustedCases = applyTimeAdjustment(cases);
  const latestOrder = Math.max(...timeAdjustedCases.map((item) => parsePeriod(item.period).order), 0);
  const weighted = timeAdjustedCases.map((item) => ({
    ...item,
    recencyWeight: getCaseWeight(item, latestOrder),
    similarityWeight: getSimilarityWeight(item),
    weight: getCaseWeight(item, latestOrder) * getSimilarityWeight(item)
  }));

  const weightTotal = weighted.reduce((sum, item) => sum + item.weight, 0);
  const weightedUnitPrice = weightTotal
    ? weighted.reduce((sum, item) => sum + (item.adjustedUnitPrice || item.unitPrice) * item.weight, 0) / weightTotal
    : null;
  const regression = ridgeRegressionPredict(weighted, options, weightedUnitPrice, propertyType);
  const predictedUnitPrice = regression ? regression.unitPrice : weightedUnitPrice;

  const trendMap = new Map();
  for (const item of cases) {
    const { year } = parsePeriod(item.period);
    if (!year) continue;
    const row = trendMap.get(year) || { year, count: 0, totalUnitPrice: 0, totalTradePrice: 0 };
    row.count += 1;
    row.totalUnitPrice += item.unitPrice;
    row.totalTradePrice += item.tradePrice / 10000;
    trendMap.set(year, row);
  }

  const trend = Array.from(trendMap.values())
    .sort((a, b) => a.year - b.year)
    .map((row) => ({
      year: row.year,
      count: row.count,
      averageUnitPrice: Math.round((row.totalUnitPrice / row.count) * 10) / 10,
      averageTradePrice: Math.round(row.totalTradePrice / row.count)
    }));

  const first = trend[0];
  const last = trend[trend.length - 1];
  let detectedMarketTrend = "flat";
  if (first && last && first.averageUnitPrice) {
    const change = (last.averageUnitPrice - first.averageUnitPrice) / first.averageUnitPrice;
    if (change > 0.05) detectedMarketTrend = "up";
    if (change < -0.05) detectedMarketTrend = "down";
  }

  const yearsWithCases = Math.max(trend.length, 1);
  const casesPerYear = cases.length / yearsWithCases;
  let detectedLiquidity = "normal";
  if (casesPerYear >= 8 && detectedMarketTrend !== "down") detectedLiquidity = "high";
  if (casesPerYear < 3 || detectedMarketTrend === "down") detectedLiquidity = "low";

  const targetFloorPlan = normalizeFloorPlan(options.floorPlan || "");
  let analysisNote;
  if (propertyType === "mansion") {
    const localityNote = analysisMeta.localityMode === "sameLocality"
      ? `同じ町名の事例${analysisMeta.localityCaseCount}件を優先しています。`
      : analysisMeta.localityFiltered
        ? `同じ地区の事例${analysisMeta.localityCaseCount}件に絞っています。`
      : analysisMeta.stationMode === "sameStationIncluded"
        ? `同じ最寄駅の事例${analysisMeta.stationCaseCount}件を必ず含めています。`
      : analysisMeta.stationFiltered
        ? `同じ最寄駅の事例${analysisMeta.stationCaseCount}件を優先しています。`
        : "";
    analysisNote = analysisMeta.floorPlanFiltered
      ? `同じ間取りの事例${analysisMeta.floorPlanCaseCount}件に絞って分析しています。候補${cases.length}件を回帰に入れ、平均㎡単価の推移で時点修正したうえで、選定範囲${analysisMeta.selectedPoolCount || cases.length}件の中で外れ値は${analysisMeta.outlierRemovedCount || 0}件除外しました。`
      : analysisMeta.floorPlanCaseCount === 0 && targetFloorPlan !== "unknown"
        ? `同じ間取りの事例が0件のため、間取りで絞らず分析しています。間取り差は補正内訳で反映します。候補${cases.length}件を回帰に入れ、平均㎡単価の推移で時点修正したうえで、選定範囲${analysisMeta.selectedPoolCount || cases.length}件の中で外れ値は${analysisMeta.outlierRemovedCount || 0}件除外しました。`
        : `同じ間取りの事例が${analysisMeta.floorPlanCaseCount || 0}件のため、間取りで絞らず分析しています。間取り差は補正内訳で反映します。候補${cases.length}件を回帰に入れ、平均㎡単価の推移で時点修正したうえで、選定範囲${analysisMeta.selectedPoolCount || cases.length}件の中で外れ値は${analysisMeta.outlierRemovedCount || 0}件除外しました。`;
    analysisNote = `${localityNote}${analysisNote}`.trim();
  } else if (propertyType === "landBuilding") {
    const localityNote = analysisMeta.localityMode === "sameLocality"
      ? `同じ町名の事例${analysisMeta.localityCaseCount}件を優先しています。`
      : analysisMeta.localityFiltered
        ? `同じ地区の事例${analysisMeta.localityCaseCount}件を優先しています。`
      : analysisMeta.stationMode === "sameStationIncluded"
        ? `同じ最寄駅の事例${analysisMeta.stationCaseCount}件を必ず含めています。`
      : analysisMeta.stationFiltered
        ? `同じ最寄駅の事例${analysisMeta.stationCaseCount}件を優先しています。`
        : "";
    analysisNote = `${localityNote}土地＋建物の成約事例${cases.length}件を市場感チェックに使っています。回帰には候補${cases.length}件を入れ、平均㎡単価の推移で時点修正したうえで、選定範囲${analysisMeta.selectedPoolCount || cases.length}件の中で外れ値は${analysisMeta.outlierRemovedCount || 0}件除外しました。`.trim();
  } else {
    const localityNote = analysisMeta.localityMode === "sameLocality"
      ? `同じ町名の事例${analysisMeta.localityCaseCount}件を優先しています。`
      : analysisMeta.localityFiltered
        ? `同じ地区の事例${analysisMeta.localityCaseCount}件に絞っています。`
      : analysisMeta.stationMode === "sameStationIncluded"
        ? `同じ最寄駅の事例${analysisMeta.stationCaseCount}件を必ず含めています。`
      : analysisMeta.stationFiltered
        ? `同じ最寄駅の事例${analysisMeta.stationCaseCount}件を優先しています。`
        : "";
    analysisNote = `${localityNote}土地の取引事例${cases.length}件を回帰に入れています。平均㎡単価の推移で時点修正したうえで、選定範囲${analysisMeta.selectedPoolCount || cases.length}件の中で外れ値は${analysisMeta.outlierRemovedCount || 0}件除外しました。`.trim();
  }

  return {
    propertyType,
    caseCount: cases.length,
    averageUnitPrice:
      predictedUnitPrice === null ? null : Math.round(predictedUnitPrice * 10) / 10,
    weightedAverageUnitPrice:
      weightedUnitPrice === null ? null : Math.round(weightedUnitPrice * 10) / 10,
    regressionUnitPrice: regression ? regression.unitPrice : null,
    weightedAverageTradePrice:
      weightTotal ? Math.round(weighted.reduce((sum, item) => sum + (item.tradePrice / 10000) * item.weight, 0) / weightTotal) : null,
    regressionRawUnitPrice: regression ? regression.rawUnitPrice : null,
    regressionSampleCount: regression ? regression.sampleCount : 0,
    timeAdjustmentAverageRate: timeAdjustedCases.timeAdjustmentMeta?.averageRate || 1,
    latestAverageUnitPrice: timeAdjustedCases.timeAdjustmentMeta?.latestAverageUnitPrice || null,
    pricingMethod: regression ? (regression.method === "ridgeCompact" ? "回帰分析（簡易）" : "回帰分析") : "参考単価",
    analysisMeta,
    caseScope: options.caseScope || null,
    analysisNote,
    detectedMarketTrend,
    detectedLiquidity,
    trend,
    cases: weighted
      .sort((a, b) => a.similarityScore - b.similarityScore)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        weight: Math.round(item.weight * 100) / 100
      }))
  };
}

async function fetchRealEstateYear(year, area, city) {
  const url = new URL("https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001");
  url.searchParams.set("year", year);
  url.searchParams.set("area", area);
  url.searchParams.set("city", city);

  const response = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.REINFOLIB_API_KEY
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`不動産情報ライブラリAPI取得失敗: ${response.status} ${text}`);
  }

  const json = JSON.parse(text);
  return Array.isArray(json.data) ? json.data : [];
}

async function geocodeAddress(address) {
  const url = new URL("https://msearch.gsi.go.jp/address-search/AddressSearch");
  url.searchParams.set("q", address);
  const { response, data } = await fetchJson(url, 7000);
  if (!response.ok) {
    throw new Error(`住所座標の取得に失敗しました: ${response.status}`);
  }
  const first = data[0];
  if (!first || !first.geometry || !first.geometry.coordinates) return null;
  const [longitude, latitude] = first.geometry.coordinates;
  return { latitude, longitude, title: first.properties && first.properties.title };
}

async function findNearestStation(latitude, longitude) {
  const url = new URL("https://express.heartrails.com/api/json");
  url.searchParams.set("method", "getStations");
  url.searchParams.set("x", longitude);
  url.searchParams.set("y", latitude);

  const { response, data } = await fetchJson(url, 7000);
  if (!response.ok) {
    throw new Error(`最寄駅の取得に失敗しました: ${response.status}`);
  }
  const stations = data.response && data.response.station;
  const station = Array.isArray(stations) ? stations[0] : stations;
  if (!station) return null;

  const distanceMeters = Number(String(station.distance || "").replace(/[^\d.]/g, ""));
  const timeText = String(station.time || "");
  const timeMatch = timeText.match(/(\d+)/);
  const walkMinutes = timeMatch
    ? Number(timeMatch[1])
    : distanceMeters
      ? Math.max(1, Math.round(distanceMeters / 80))
      : "";
  return {
    name: station.name,
    line: station.line,
    distanceMeters,
    walkMinutes
  };
}

async function lookupPostalCodeWithZipcloud(zipcode) {
  const url = new URL("https://zipcloud.ibsnet.co.jp/api/search");
  url.searchParams.set("zipcode", zipcode);
  const { response, text, data } = await fetchJson(url, 7000);
  if (!response.ok) {
    throw new Error(`zipcloud取得失敗: ${response.status} ${text}`);
  }
  if (!data || data.status !== 200 || !data.results || !data.results[0]) {
    return null;
  }

  const result = data.results[0];
  return {
    prefecture: result.address1,
    municipality: result.address2,
    town: result.address3,
    address: `${result.address1}${result.address2}${result.address3}`,
    provider: "zipcloud"
  };
}

async function lookupPostalCodeWithZipaddress(zipcode) {
  const url = new URL("https://api.zipaddress.net/");
  url.searchParams.set("zipcode", zipcode);
  const { response, text, data } = await fetchJson(url, 7000);
  if (!response.ok) {
    throw new Error(`zipaddress取得失敗: ${response.status} ${text}`);
  }
  if (!data || Number(data.code) !== 200 || !data.data) {
    return null;
  }

  const result = data.data;
  return {
    prefecture: result.pref || "",
    municipality: result.city || "",
    town: result.town || "",
    address: result.fullAddress || `${result.pref || ""}${result.city || ""}${result.town || ""}`,
    provider: "zipaddress"
  };
}

app.get("/api/postal-code", async (req, res) => {
  try {
    const zipcode = String(req.query.zipcode || "").replace(/[^\d]/g, "");
    if (zipcode.length !== 7) {
      return res.status(400).json({ error: "郵便番号は7桁で入力してください。" });
    }

    let result = null;
    const warnings = [];

    try {
      result = await lookupPostalCodeWithZipcloud(zipcode);
    } catch (error) {
      warnings.push("郵便番号サービス1が使えませんでした。");
    }

    if (!result) {
      try {
        result = await lookupPostalCodeWithZipaddress(zipcode);
      } catch (error) {
        warnings.push("郵便番号サービス2も使えませんでした。");
      }
    }

    if (!result) {
      return res.status(404).json({ error: "住所が見つかりませんでした。" });
    }

    const address = result.address;
    res.json({
      prefecture: result.prefecture,
      municipality: result.municipality,
      town: result.town,
      address,
      provider: result.provider,
      warnings,
      ...inferCodesFromAddress(address)
    });
  } catch (error) {
    res.status(500).json({
      error: "郵便番号から住所を取得できませんでした。",
      message: error.message
    });
  }
});

app.get("/api/address-info", async (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    if (!address) {
      return res.status(400).json({ error: "住所を入力してください。" });
    }

    let codes = inferCodesFromAddress(address);
    let geocode = null;
    let station = null;
    const warnings = [];

    try {
      geocode = await geocodeAddress(address);
    } catch (error) {
      warnings.push("地図上の位置を特定できませんでした。");
    }

    if (geocode) {
      codes = mergeAddressCodes(address, geocode.title || "");
      try {
        station = await findNearestStation(geocode.latitude, geocode.longitude);
      } catch (error) {
        warnings.push("最寄駅の自動取得ができませんでした。");
      }
    } else {
      warnings.push("地図上の位置を特定できませんでした。");
    }

    res.json({
      address,
      ...codes,
      geocode,
      station,
      warnings
    });
  } catch (error) {
    res.status(500).json({
      error: "住所情報を自動取得できませんでした。",
      message: error.message
    });
  }
});

app.get("/api/real-estate-cases", async (req, res) => {
  try {
    const {
      year,
      area: requestedArea,
      city: requestedCity,
      address = "",
      propertyType = "mansion",
      yearsBack = "5",
      targetArea = "",
      landArea = "",
      buildingTotalArea = "",
      buildingAge = "",
      floorPlan = "",
      walkMinutes = "",
      structure = "",
      station = "",
      stationName = "",
      targetDistrict = ""
    } = req.query;

    const inferredFromAddress = address ? inferCodesFromAddress(String(address).trim()) : {};
    let area = String(requestedArea || "").trim();
    let city = String(requestedCity || "").trim();
    if ((!area || !city) && address) {
      area = area || inferredFromAddress.area;
      city = city || inferredFromAddress.city;
    }

    if (!area || !city) {
      return res.status(400).json({
        error: "都道府県コードと市区町村コードが必要です。"
      });
    }
    if (propertyType === "mansion" && normalizeFloorPlan(floorPlan) === "unknown") {
      return res.status(400).json({
        error: "中古マンションでは間取りが必須です。"
      });
    }

    const targetLocality = extractLocalityFromAddress(
      targetDistrict || address,
      inferredFromAddress.prefecture,
      inferredFromAddress.municipality
    );
    const localityFactor = getLocalityFactor(targetLocality);
    const modelOptions = {
      targetArea,
      targetLandArea: landArea || targetArea,
      targetBuildingTotalArea: buildingTotalArea || targetArea,
      buildingAge,
      floorPlan,
      walkMinutes,
      structure,
      stationName: stationName || station,
      targetDistrict,
      targetLocality,
      localityFactor
    };

    let years = buildTargetYears(year, yearsBack, 5, 10);
    let results = await Promise.allSettled(
      years.map((targetYear) => fetchRealEstateYear(targetYear, area, city))
    );
    let items = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );

    const initialPropertyType = propertyType === "landBuilding" ? "land" : propertyType;
    let previewCases = chooseCases(items, initialPropertyType, modelOptions);
    if (Number(yearsBack || 5) < 10 && shouldExpandCaseWindow(previewCases, initialPropertyType)) {
      years = buildTargetYears(year, 10, 5, 10);
      results = await Promise.allSettled(
        years.map((targetYear) => fetchRealEstateYear(targetYear, area, city))
      );
      items = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : []
      );
      previewCases = chooseCases(items, initialPropertyType, modelOptions);
    }
    const caseScope = {
      yearRange: years.length ? { start: Number(years[years.length - 1]), end: Number(years[0]) } : null,
      localityMode: previewCases.analysisMeta?.localityMode || "sameMunicipality",
      stationMode: previewCases.analysisMeta?.stationMode || "broad",
      layoutMode: previewCases.analysisMeta?.layoutMode || (propertyType === "mansion" ? "similarLayout" : "notUsed")
    };

    if (propertyType === "landBuilding") {
      const landCases = chooseCases(items, "land", modelOptions);
      const landSummary = summarizeCases(landCases, "land", { ...modelOptions, caseScope });
      const marketOptions = {
        ...modelOptions,
        targetArea: buildingTotalArea || targetArea,
        targetLandArea: landArea || targetArea,
        caseScope
      };
      const landBuildingCases = chooseCases(items, "landBuilding", marketOptions);
      const marketSummary = summarizeCases(landBuildingCases, "landBuilding", marketOptions);

      return res.json({
        status: "OK",
        year,
        years,
        area,
        city,
        ...landSummary,
        propertyType: "landBuilding",
        pricingMethod: landSummary.pricingMethod,
        landComparison: landSummary,
        landBuildingMarket: {
          caseCount: marketSummary.caseCount,
          averageTradePrice: marketSummary.weightedAverageTradePrice,
          averageUnitPrice: marketSummary.averageUnitPrice,
          cases: marketSummary.cases,
          analysisNote: marketSummary.analysisNote
        },
        analysisNote: `${landSummary.analysisNote} 土地＋建物の成約事例${marketSummary.caseCount || 0}件も市場感チェックに使います。`
      });
    }

    const chosenCases = chooseCases(items, propertyType, modelOptions);
    const chosenCaseScope = {
      ...caseScope,
      localityMode: chosenCases.analysisMeta?.localityMode || caseScope.localityMode,
      stationMode: chosenCases.analysisMeta?.stationMode || caseScope.stationMode,
      layoutMode: chosenCases.analysisMeta?.layoutMode || caseScope.layoutMode
    };

    res.json({
      status: "OK",
      year,
      years,
      area,
      city,
      ...summarizeCases(chosenCases, propertyType, { ...modelOptions, caseScope: chosenCaseScope })
    });
  } catch (error) {
    res.status(500).json({
      error: "サーバー側でエラーが発生しました",
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


