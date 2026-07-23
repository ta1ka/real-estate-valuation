(function () {
  var state = {
    propertyType: "mansion",
    propertyTypeLabel: "中古マンション",
    detectedMarketTrend: "flat",
    detectedLiquidity: "normal",
    detectedPrefecture: "",
    detectedMunicipality: ""
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function value(id) {
    var element = byId(id);
    return element ? element.value : "";
  }

  function setValue(id, newValue) {
    var element = byId(id);
    if (!element || newValue === undefined || newValue === null) return;
    element.value = String(newValue);
  }

  function numberValue(id) {
    return Number(value(id) || 0);
  }

  function percentText(valueNumber) {
    var rounded = Math.round((Number(valueNumber) || 0) * 10) / 10;
    var sign = rounded > 0 ? "+" : "";
    return sign + rounded.toLocaleString("ja-JP") + "%";
  }

  function formatManYen(valueInManYen) {
    return Math.round(Number(valueInManYen) || 0).toLocaleString("ja-JP") + "万円";
  }

  function formatUnitPrice(valueInManYen) {
    return (Math.round((Number(valueInManYen) || 0) * 10) / 10).toLocaleString("ja-JP") + "万円/㎡";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fullAddress() {
    return String(value("addressBase") + value("addressDetail")).trim();
  }

  function showMessage(text) {
    var element = byId("message");
    if (element) {
      element.textContent = text || "";
    }
  }

  function issueTextAssessment(text) {
    var source = String(text || "").trim();
    if (!source) {
      return {
        label: "入力なし",
        headline: "",
        detail: "",
        visible: false
      };
    }

    var severeKeywords = [
      "事故", "事件", "自殺", "孤独死", "告知事項", "再建築不可", "借地", "定期借地",
      "共有持分", "違法建築", "立ち退き", "立退き", "傾き", "雨漏り", "シロアリ",
      "火災", "境界未確定", "近隣トラブル", "ゴミ屋敷"
    ];
    var moderateKeywords = [
      "老朽", "空き家", "残置物", "私道", "セットバック", "擁壁", "ハザード",
      "土壌", "埋設", "騒音", "臭い", "心理的", "修繕", "不整形", "旗竿"
    ];

    var severeHits = severeKeywords.filter(function (keyword) {
      return source.indexOf(keyword) >= 0;
    });
    var moderateHits = moderateKeywords.filter(function (keyword) {
      return source.indexOf(keyword) >= 0;
    });

    if (severeHits.length) {
      return {
        label: "可能性あり",
        headline: "訳アリ物件として見られる可能性があります",
        detail: "入力内容に「" + severeHits.slice(0, 4).join("、") + "」が含まれています。通常の相場売却ではなく、個別事情を見られる売却先が向く可能性があります。",
        visible: true
      };
    }

    if (moderateHits.length || source.length >= 20) {
      return {
        label: "要確認",
        headline: "売りにくさにつながる事情がありそうです",
        detail: "相場どおりに売れるかは個別確認が必要です。特に「" + (moderateHits.slice(0, 4).join("、") || "自由記述の内容") + "」は見方が分かれやすい点です。",
        visible: true
      };
    }

    return {
      label: "軽微",
      headline: "大きな訳アリ要素は文面上では強く出ていません",
      detail: "ただし、文章に入っていない事情までは判定できません。権利関係や建物状態に不安がある場合は追記すると見やすくなります。",
      visible: true
    };
  }

  function renderIssueAssessment(assessment, sourceText) {
    var label = byId("issuePropertyLabel");
    var root = byId("issuePropertySummary");
    var headline = byId("issuePropertyHeadline");
    var detail = byId("issuePropertyDetail");
    if (label) label.textContent = assessment.label || "-";
    if (!root || !headline || !detail) return;

    if (!assessment.visible) {
      root.classList.add("hidden");
      headline.textContent = "";
      detail.textContent = "";
      return;
    }

    root.classList.remove("hidden");
    headline.textContent = assessment.headline || "";
    detail.textContent = assessment.detail + (sourceText ? " 入力内容: " + sourceText : "");
  }

  function setDetectedAreaText() {
    var area = [state.detectedPrefecture, state.detectedMunicipality].filter(Boolean).join(" ");
    var element = byId("detectedArea");
    if (element) {
      element.textContent = area ? "対象エリア：" + area : "対象エリア：未検知";
    }
  }

  function addAdjustment(list, category, label, percent) {
    list.push({
      category: category,
      label: label,
      percent: Math.round((Number(percent) || 0) * 10) / 10,
      applied: Boolean(percent)
    });
  }

  function sumAdjustments(list, category) {
    return Math.round(
      list
        .filter(function (item) {
          return !category || item.category === category;
        })
        .reduce(function (sum, item) {
          return sum + item.percent;
        }, 0) * 10
    ) / 10;
  }

  function clampNegativeAdjustment(valueNumber, limitAbs) {
    return Math.max(Number(valueNumber) || 0, -Math.abs(limitAbs));
  }

  function applyPercent(baseValue, percent) {
    return baseValue * (1 + (Number(percent) || 0) / 100);
  }

  function renderAdjustments(list, badConditionRaw, badConditionCapped) {
    var root = byId("adjustments");
    if (!root) return;

    if (!list.length) {
      root.innerHTML = "<p class='note'>補正一覧がありません。</p>";
      return;
    }

    var rows = list.map(function (item) {
      return (
        "<tr><td>" + escapeHtml(item.category) + "</td><td>" + escapeHtml(item.label) + "</td><td>" +
        escapeHtml(percentText(item.percent)) + "</td><td>" + (item.applied ? "反映" : "該当なし") + "</td></tr>"
      );
    }).join("");

    if (badConditionRaw !== badConditionCapped) {
      rows += "<tr><td>悪条件</td><td>悪条件補正の上限を適用</td><td>" + escapeHtml(percentText(badConditionCapped)) + "</td><td>反映</td></tr>";
    }

    root.innerHTML =
      "<table>" +
      "<thead><tr><th>区分</th><th>項目</th><th>補正率</th><th>状態</th></tr></thead>" +
      "<tbody>" + rows + "</tbody>" +
      "</table>";
  }

  function setPropertyType(type) {
    var labelMap = {
      mansion: "中古マンション",
      land: "土地",
      landBuilding: "土地＋建物"
    };

    state.propertyType = type;
    state.propertyTypeLabel = labelMap[type] || "中古マンション";

    byId("mansionButton").classList.toggle("active", type === "mansion");
    byId("landButton").classList.toggle("active", type === "land");
    byId("landBuildingButton").classList.toggle("active", type === "landBuilding");

    if (byId("selectedPropertyTypeLabel")) {
      byId("selectedPropertyTypeLabel").textContent = state.propertyTypeLabel;
    }

    byId("occupancyFields").classList.toggle("hidden", !(type === "mansion" || type === "landBuilding"));
    byId("mansionFields").classList.toggle("hidden", !(type === "mansion" || type === "landBuilding"));
    byId("landFields").classList.toggle("hidden", !(type === "land" || type === "landBuilding"));
    byId("targetAreaLabel").classList.toggle("hidden", type === "landBuilding");
    byId("landBuildingAreaFields").classList.toggle("hidden", type !== "landBuilding");

    Array.prototype.forEach.call(document.querySelectorAll(".mansion-only"), function (element) {
      element.classList.toggle("hidden", type !== "mansion");
    });

    Array.prototype.forEach.call(document.querySelectorAll(".land-building-only"), function (element) {
      element.classList.toggle("hidden", type !== "landBuilding");
    });
  }

  function showTypeSelectionPage() {
    document.body.classList.add("type-step-active");
    document.body.classList.remove("input-hidden");
    byId("backButton").classList.add("hidden");
    byId("editButton").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showPropertyDetailPage() {
    document.body.classList.remove("type-step-active");
    document.body.classList.remove("input-hidden");
    byId("backButton").classList.add("hidden");
    byId("editButton").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectPropertyTypeAndContinue(type) {
    setPropertyType(type);
    showPropertyDetailPage();
  }

  function showResultPage() {
    document.body.classList.add("input-hidden");
    document.body.classList.remove("type-step-active");
    byId("backButton").classList.remove("hidden");
    byId("editButton").classList.remove("hidden");

    var result = document.querySelector(".result");
    if (result && result.scrollIntoView) {
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function showInputPage() {
    showPropertyDetailPage();
  }

  function updateDetectedState(data) {
    state.detectedPrefecture = data.prefecture || state.detectedPrefecture || "";
    state.detectedMunicipality = data.municipality || state.detectedMunicipality || "";
    setDetectedAreaText();
  }

  async function lookupPostalCode() {
    var zipcode = String(value("zipcode")).replace(/[^\d]/g, "");
    if (!zipcode) {
      showMessage("郵便番号を入力してください。");
      return;
    }

    showMessage("住所を検索しています...");

    try {
      var res = await fetch("/api/postal-code?zipcode=" + encodeURIComponent(zipcode));
      var data = await res.json();

      if (!res.ok) {
        showMessage(data.error || "住所を取得できませんでした。");
        return;
      }

      setValue("addressBase", data.address || "");
      setValue("area", data.area || "");
      setValue("city", data.city || "");
      updateDetectedState(data);
      showMessage("住所を入力しました。");
    } catch (error) {
      showMessage("住所を取得できませんでした。");
    }
  }

  async function detectAddressInfo() {
    if (!value("addressBase")) {
      showMessage("先に住所を入力してください。");
      return;
    }

    showMessage("住所からエリアと最寄駅を確認しています...");

    try {
      var res = await fetch("/api/address-info?address=" + encodeURIComponent(fullAddress()));
      var data = await res.json();

      if (!res.ok) {
        showMessage(data.error || "住所を検知できませんでした。");
        return;
      }

      setValue("area", data.area || "");
      setValue("city", data.city || "");
      updateDetectedState(data);

      if (data.station) {
        setValue("stationName", data.station.name || "");
        setValue("walkMinutes", data.station.walkMinutes || "");
      }

      var parts = [];
      if (state.detectedPrefecture) parts.push(state.detectedPrefecture);
      if (state.detectedMunicipality) parts.push(state.detectedMunicipality);
      if (data.station && data.station.name) {
        parts.push(data.station.name + " 徒歩" + (data.station.walkMinutes || "") + "分");
      }
      if (Array.isArray(data.warnings) && data.warnings.length) {
        parts.push(data.warnings.join(" / "));
      }

      showMessage(parts.join(" / ") || "住所を検知しました。");
    } catch (error) {
      showMessage("住所を検知できませんでした。");
    }
  }

  async function ensureAreaCodesForValuation() {
    if (value("area") && value("city")) return true;
    if (!value("addressBase")) return false;

    try {
      var res = await fetch("/api/address-info?address=" + encodeURIComponent(fullAddress()));
      var data = await res.json();
      if (!res.ok) return false;

      setValue("area", data.area || "");
      setValue("city", data.city || "");
      updateDetectedState(data);

      if (!value("stationName") && data.station) {
        setValue("stationName", data.station.name || "");
        setValue("walkMinutes", data.station.walkMinutes || "");
      }

      return Boolean(value("area") && value("city"));
    } catch (error) {
      return false;
    }
  }

  function marketCoefficientForType(propertyType) {
    if (propertyType === "mansion") return 1.02;
    if (propertyType === "land") return 1.16;
    return 1.12;
  }

  function badConditionCapForType(propertyType) {
    if (propertyType === "mansion") return 20;
    if (propertyType === "land") return 35;
    return 40;
  }

  function addCommonConditionAdjustments(list) {
    var walk = numberValue("walkMinutes");
    if (state.propertyType === "mansion") {
      addAdjustment(list, "物件条件", "駅徒歩", walk <= 3 ? 3.5 : walk <= 5 ? 2 : walk <= 10 ? 0.8 : walk <= 15 ? -1 : walk <= 20 ? -2.5 : -4);
    }
  }

  function addMansionConditionAdjustments(list) {
    var floor = numberValue("floor");
    var totalFloors = numberValue("totalFloors");
    var ratio = floor > 0 && totalFloors > 0 ? floor / totalFloors : 0;

    addAdjustment(list, "物件条件", "所在階", ratio >= 0.75 ? 3 : ratio >= 0.35 ? 1 : ratio > 0 ? -1.5 : 0);
    addAdjustment(list, "物件条件", "方角", value("direction") === "south" ? 1 : value("direction") === "north" ? -1 : 0);
    addAdjustment(list, "物件条件", "建物構造", value("structure") === "rc" ? 0.5 : value("structure") === "wood" ? -1 : 0);
    addAdjustment(list, "物件条件", "リフォーム", value("renovation") === "renovated" ? 2 : value("renovation") === "needed" ? -2 : 0);
    addAdjustment(list, "物件条件", "管理状態", value("management") === "good" ? 1.5 : value("management") === "poor" ? -2.5 : 0);
    addAdjustment(list, "物件条件", "オーナーチェンジ", value("occupancyStatus") === "ownerChange" ? -5 : 1);
    addAdjustment(list, "物件条件", "角部屋", value("cornerRoom") === "yes" ? 1 : 0);
    addAdjustment(list, "物件条件", "エレベーター", value("elevator") === "yes" ? 0.5 : value("elevator") === "no" ? -3 : 0);
    addAdjustment(list, "物件条件", "管理費", numberValue("managementFee") > 25000 ? -2 : 0);
    addAdjustment(list, "物件条件", "修繕積立金", numberValue("repairReserve") >= 8000 && numberValue("repairReserve") <= 35000 ? 0.8 : numberValue("repairReserve") > 0 ? -1.5 : 0);
    addAdjustment(list, "物件条件", "大規模修繕", value("majorRepair") === "recent" ? 1 : value("majorRepair") === "planned" ? 0.3 : value("majorRepair") === "none" ? -1.5 : 0);
    addAdjustment(list, "物件条件", "眺望", value("viewQuality") === "good" ? 1 : value("viewQuality") === "poor" ? -1 : 0);
    addAdjustment(list, "物件条件", "日当たり", value("sunlight") === "good" ? 1 : value("sunlight") === "poor" ? -1.5 : 0);
    addAdjustment(list, "物件条件", "宅配ボックス", value("deliveryBox") === "yes" ? 0.5 : 0);
    addAdjustment(list, "物件条件", "ペット可", value("petAllowed") === "yes" ? 0.5 : value("petAllowed") === "no" ? -0.5 : 0);
    addAdjustment(list, "物件条件", "オートロック", value("autoLock") === "yes" ? 0.5 : 0);
    addAdjustment(list, "物件条件", "駐車場", value("parking") === "included" ? 2 : value("parking") === "onsite" ? 0.8 : value("parking") === "no" ? -0.8 : 0);
  }

  function addLandConditionAdjustments(list) {
    addAdjustment(list, "物件条件", "接道方位", value("roadDirection") === "south" ? 1.5 : 0);
  }

  function addLandBuildingConditionAdjustments(list) {
    addAdjustment(list, "物件条件", "自己利用", value("occupancyStatus") === "ownerChange" ? -4 : 1);
    addAdjustment(list, "物件条件", "リフォーム済み", value("renovation") === "renovated" ? 3 : 0);
    addAdjustment(list, "物件条件", "既存建物の利用可", value("oldBuilding") === "usable" ? 2 : 0);
    addAdjustment(list, "物件条件", "接道方位", value("roadDirection") === "south" ? 1.5 : 0);
  }

  function addLandBadConditionAdjustments(list) {
    addAdjustment(list, "悪条件", "再建築不可", value("rebuildable") === "no" ? -30 : 0);
    addAdjustment(list, "悪条件", "再建築制限あり", value("rebuildable") === "limited" ? -12 : 0);
    addAdjustment(list, "悪条件", "セットバック要", value("setback") === "needed" ? -7 : 0);
    addAdjustment(list, "悪条件", "接道4m未満", numberValue("roadWidth") > 0 && numberValue("roadWidth") < 4 ? -8 : 0);
    addAdjustment(list, "悪条件", "私道負担あり", value("roadOwnership") === "private" ? -5 : 0);
    addAdjustment(list, "悪条件", "不整形地", value("landShape") === "irregular" ? -10 : 0);
    addAdjustment(list, "悪条件", "借地権", value("landRight") === "leasehold" ? -24 : 0);
    addAdjustment(list, "悪条件", "定期借地権", value("landRight") === "fixedLeasehold" ? -30 : 0);
    addAdjustment(list, "悪条件", "共有持分・特殊権利", value("landRight") === "shared" ? -12 : 0);
    addAdjustment(list, "悪条件", "境界未確定", value("boundary") === "unfixed" ? -3 : 0);
    addAdjustment(list, "悪条件", "上下水道未整備", value("waterSewer") === "none" ? -5 : 0);
    addAdjustment(list, "悪条件", "高いハザードリスク", value("hazardRisk") === "high" ? -8 : 0);
    addAdjustment(list, "悪条件", "土壌・擁壁リスク中", value("soilRisk") === "medium" ? -3 : 0);
    addAdjustment(list, "悪条件", "土壌・擁壁リスク高", value("soilRisk") === "high" ? -8 : 0);
  }

  function addLandBuildingBadConditionAdjustments(list) {
    addLandBadConditionAdjustments(list);
    addAdjustment(list, "悪条件", "要大規模リフォーム", value("renovation") === "needed" ? -12 : 0);
    addAdjustment(list, "悪条件", "古家解体前提", value("oldBuilding") === "removal" ? -6 : 0);
  }

  function buildAdjustmentLists() {
    var allAdjustments = [];
    addCommonConditionAdjustments(allAdjustments);

    if (state.propertyType === "mansion") {
      addMansionConditionAdjustments(allAdjustments);
    } else if (state.propertyType === "land") {
      addLandConditionAdjustments(allAdjustments);
      addLandBadConditionAdjustments(allAdjustments);
    } else {
      addLandBuildingConditionAdjustments(allAdjustments);
      addLandBuildingBadConditionAdjustments(allAdjustments);
    }

    return allAdjustments;
  }

  function calculateBuildingCost() {
    if (state.propertyType !== "landBuilding") {
      return { price: 0, label: "-" };
    }

    var area = numberValue("buildingTotalArea");
    if (!area) {
      return { price: 0, label: "-" };
    }

    var age = Math.max(numberValue("buildingAge"), 0);
    var structureType = value("structure");
    var specMap = {
      rc: { cost: 28, life: 47, label: "RC・SRC" },
      steel: { cost: 24, life: 34, label: "鉄骨造" },
      wood: { cost: 18, life: 22, label: "木造" },
      unknown: { cost: 20, life: 30, label: "構造不明" }
    };
    var spec = specMap[structureType] || specMap.unknown;
    var remainingRate = Math.max(0.1, 1 - age / spec.life);
    var price = area * spec.cost * remainingRate;

    return {
      price: price,
      label: "原価法：" + spec.label + " " + spec.cost + "万円/㎡ × " + area + "㎡ × 残存率" + Math.round(remainingRate * 100) + "%"
    };
  }

  function updateCaseScope(data) {
    var scope = data.caseScope;
    if (!scope) {
      byId("caseScope").textContent = "査定すると、対象地域・物件種別ごとの事例数を表示します。";
      return;
    }

    var yearText = scope.yearRange ? scope.yearRange.start + "年から" + scope.yearRange.end + "年" : "";
    var stationText =
      scope.stationMode === "sameStationIncluded" ? "同じ最寄駅を必ず含める" :
      scope.stationMode === "sameStation" ? "同じ最寄駅を優先" :
      scope.stationMode === "nearStation" ? "近い駅も含めて抽出" :
      "駅条件は広めに抽出";
    var localityText =
      scope.localityMode === "sameLocality" ? "同じ町名を優先" :
      scope.localityMode === "sameMunicipality" ? "市区町村全体から抽出" :
      "対象地域を広めに抽出";
    var layoutText = scope.layoutMode === "sameLayout" ? "同じ間取りを優先" : "間取りは広めに抽出";

    byId("caseScope").textContent = [yearText, stationText, localityText, layoutText].filter(Boolean).join(" / ");
  }

  function emptyChartMessage(message) {
    return "<div class='note' style='padding:12px;'>" + escapeHtml(message) + "</div>";
  }

  function renderLineChart(containerId, rows, valueKey, color, valueFormatter) {
    var root = byId(containerId);
    if (!root) return;
    if (!rows.length) {
      root.innerHTML = emptyChartMessage("推移データがありません。");
      return;
    }

    var width = 760;
    var height = 240;
    var left = 56;
    var right = 20;
    var top = 20;
    var bottom = 42;
    var innerWidth = width - left - right;
    var innerHeight = height - top - bottom;
    var values = rows.map(function (row) { return Math.max(Number(row[valueKey] || 0), 0); });
    var maxValue = Math.max.apply(null, values.concat([1]));
    var pointGap = rows.length > 1 ? innerWidth / (rows.length - 1) : 0;

    var points = rows.map(function (row, index) {
      var rawValue = Math.max(Number(row[valueKey] || 0), 0);
      return {
        label: String(row.year || ""),
        rawValue: rawValue,
        x: left + (rows.length > 1 ? pointGap * index : innerWidth / 2),
        y: top + innerHeight - (rawValue / maxValue) * innerHeight
      };
    });

    var axisLabels = [];
    for (var i = 0; i <= 4; i += 1) {
      var ratio = i / 4;
      var gridValue = Math.round(maxValue * (1 - ratio));
      var yPos = top + innerHeight * ratio;
      axisLabels.push(
        "<line x1='" + left + "' y1='" + yPos + "' x2='" + (width - right) + "' y2='" + yPos + "' stroke='#e2e8f0' stroke-width='1' />" +
        "<text x='" + (left - 8) + "' y='" + (yPos + 4) + "' text-anchor='end' fill='#64748b' font-size='11'>" + escapeHtml(valueFormatter(gridValue)) + "</text>"
      );
    }

    var polyline = points.map(function (point) { return point.x + "," + point.y; }).join(" ");
    var pointNodes = points.map(function (point) {
      return (
        "<circle cx='" + point.x + "' cy='" + point.y + "' r='4' fill='" + color + "' />" +
        "<title>" + escapeHtml(point.label + " " + valueFormatter(point.rawValue)) + "</title>" +
        "<text x='" + point.x + "' y='" + (height - 14) + "' text-anchor='middle' fill='#64748b' font-size='11'>" + escapeHtml(point.label) + "</text>"
      );
    }).join("");

    root.innerHTML =
      "<svg viewBox='0 0 " + width + " " + height + "' role='img' aria-label='価格推移グラフ'>" +
      "<rect x='0' y='0' width='" + width + "' height='" + height + "' fill='#ffffff' />" +
      axisLabels.join("") +
      "<line x1='" + left + "' y1='" + top + "' x2='" + left + "' y2='" + (height - bottom) + "' stroke='#94a3b8' stroke-width='1.2' />" +
      "<line x1='" + left + "' y1='" + (height - bottom) + "' x2='" + (width - right) + "' y2='" + (height - bottom) + "' stroke='#94a3b8' stroke-width='1.2' />" +
      "<polyline fill='none' stroke='" + color + "' stroke-width='3' points='" + polyline + "' stroke-linecap='round' stroke-linejoin='round' />" +
      pointNodes +
      "</svg>";
  }

  function renderBarChart(containerId, rows, valueKey, color, valueFormatter) {
    var root = byId(containerId);
    if (!root) return;
    if (!rows.length) {
      root.innerHTML = emptyChartMessage("推移データがありません。");
      return;
    }

    var width = 760;
    var height = 240;
    var left = 56;
    var right = 20;
    var top = 20;
    var bottom = 42;
    var innerWidth = width - left - right;
    var innerHeight = height - top - bottom;
    var values = rows.map(function (row) { return Math.max(Number(row[valueKey] || 0), 0); });
    var maxValue = Math.max.apply(null, values.concat([1]));
    var barGap = 12;
    var barWidth = Math.max(24, (innerWidth - barGap * (rows.length - 1)) / rows.length);

    var axisLabels = [];
    for (var i = 0; i <= 4; i += 1) {
      var ratio = i / 4;
      var gridValue = Math.round(maxValue * (1 - ratio));
      var yPos = top + innerHeight * ratio;
      axisLabels.push(
        "<line x1='" + left + "' y1='" + yPos + "' x2='" + (width - right) + "' y2='" + yPos + "' stroke='#e2e8f0' stroke-width='1' />" +
        "<text x='" + (left - 8) + "' y='" + (yPos + 4) + "' text-anchor='end' fill='#64748b' font-size='11'>" + escapeHtml(valueFormatter(gridValue)) + "</text>"
      );
    }

    var barNodes = rows.map(function (row, index) {
      var rawValue = Math.max(Number(row[valueKey] || 0), 0);
      var x = left + index * (barWidth + barGap);
      var barHeight = (rawValue / maxValue) * innerHeight;
      var y = top + innerHeight - barHeight;
      return (
        "<rect x='" + x + "' y='" + y + "' width='" + barWidth + "' height='" + barHeight + "' rx='4' fill='" + color + "' />" +
        "<title>" + escapeHtml(String(row.year || "") + " " + valueFormatter(rawValue)) + "</title>" +
        "<text x='" + (x + barWidth / 2) + "' y='" + (height - 14) + "' text-anchor='middle' fill='#64748b' font-size='11'>" + escapeHtml(String(row.year || "")) + "</text>"
      );
    }).join("");

    root.innerHTML =
      "<svg viewBox='0 0 " + width + " " + height + "' role='img' aria-label='事例数グラフ'>" +
      "<rect x='0' y='0' width='" + width + "' height='" + height + "' fill='#ffffff' />" +
      axisLabels.join("") +
      "<line x1='" + left + "' y1='" + top + "' x2='" + left + "' y2='" + (height - bottom) + "' stroke='#94a3b8' stroke-width='1.2' />" +
      "<line x1='" + left + "' y1='" + (height - bottom) + "' x2='" + (width - right) + "' y2='" + (height - bottom) + "' stroke='#94a3b8' stroke-width='1.2' />" +
      barNodes +
      "</svg>";
  }

  function renderTrend(rows) {
    var trendRows = Array.isArray(rows) ? rows : [];
    byId("trendBody").innerHTML = trendRows.length ? trendRows.map(function (row) {
      return "<tr><td>" + escapeHtml(row.year) + "</td><td>" + escapeHtml(row.count) + "</td><td>" +
        escapeHtml(formatUnitPrice(row.averageUnitPrice || 0)) + "</td><td>" +
        escapeHtml(formatManYen(row.averageTradePrice || 0)) + "</td></tr>";
    }).join("") : "<tr><td colspan='4'>推移データがありません。</td></tr>";

    renderLineChart("priceChart", trendRows, "averageUnitPrice", "#0f766e", function (valueNumber) {
      return Math.round(valueNumber).toLocaleString("ja-JP");
    });

    renderBarChart("countChart", trendRows, "count", "#2563eb", function (valueNumber) {
      return String(Math.round(valueNumber));
    });
  }

  function renderCases(rows) {
    var cases = Array.isArray(rows) ? rows : [];
    byId("casesBody").innerHTML = cases.length ? cases.slice(0, 5).map(function (row) {
      return "<tr><td>" + escapeHtml(row.district || "-") + "</td><td>" + escapeHtml(row.area || "-") + "㎡</td><td>" +
        escapeHtml(formatManYen(Number(row.tradePrice || 0) / 10000)) + "</td><td>" +
        escapeHtml(formatUnitPrice(row.unitPrice || 0)) + "</td><td>" +
        escapeHtml(row.period || "-") + "</td></tr>";
    }).join("") : "<tr><td colspan='5'>表示できる事例がありません。</td></tr>";
  }

  function updatePriceBreakdown(contractBasePrice, conditionAdjustmentTotal, marketCoefficient, badConditionAdjustmentTotal) {
    byId("contractBasePrice").textContent = formatManYen(contractBasePrice);
    byId("conditionAdjustmentTotal").textContent = percentText(conditionAdjustmentTotal);
    byId("marketAdjustmentFactor").textContent = marketCoefficient.toFixed(2) + "倍";
    byId("badConditionAdjustmentTotal").textContent = percentText(badConditionAdjustmentTotal);
  }

  async function runValuation() {
    showMessage("");

    if (!value("zipcode")) {
      showMessage("郵便番号を入力してください。");
      byId("zipcode").focus();
      return;
    }
    if (!value("addressBase")) {
      showMessage("住所を入力してください。");
      byId("addressBase").focus();
      return;
    }

    var areaReady = await ensureAreaCodesForValuation();
    if (!areaReady) {
      showMessage("住所から都道府県コードと市区町村コードを取得できませんでした。");
      return;
    }

    if (!value("stationName")) {
      showMessage("最寄駅を入力してください。");
      byId("stationName").focus();
      return;
    }
    if (!value("walkMinutes")) {
      showMessage("駅からの分数を入力してください。");
      byId("walkMinutes").focus();
      return;
    }
    if (state.propertyType === "mansion" && value("floorPlan") === "unknown") {
      showMessage("中古マンションでは間取りを選んでください。");
      byId("floorPlan").focus();
      return;
    }

    if (state.propertyType === "landBuilding") {
      if (!numberValue("landArea")) {
        showMessage("土地面積を入力してください。");
        byId("landArea").focus();
        return;
      }
      if (!numberValue("buildingTotalArea")) {
        showMessage("建物延床面積を入力してください。");
        byId("buildingTotalArea").focus();
        return;
      }
    } else if (!numberValue("targetArea")) {
      showMessage("面積を入力してください。");
      byId("targetArea").focus();
      return;
    }

    showMessage("査定を行っています...");

    try {
      var params = new URLSearchParams({
        propertyType: state.propertyType,
        area: value("area"),
        city: value("city"),
        station: value("stationName"),
        walkMinutes: value("walkMinutes"),
        buildingAge: value("buildingAge"),
        floorPlan: value("floorPlan"),
        targetArea: value("targetArea"),
        landArea: value("landArea"),
        buildingTotalArea: value("buildingTotalArea"),
        address: fullAddress()
      });

      var res = await fetch("/api/real-estate-cases?" + params.toString());
      var data = await res.json();

      if (!res.ok) {
        showMessage(data.message ? (data.error || "査定に失敗しました。") + " " + data.message : (data.error || "査定に失敗しました。"));
        return;
      }

      var contractBaseUnitPrice = Number(data.averageUnitPrice || 0);
      var weightedUnitPrice = Number(data.weightedAverageUnitPrice || 0);
      var buildingCost = calculateBuildingCost();
      var contractBasePrice = 0;
      var landMethodResult = "-";
      var pricingMethod = data.pricingMethod || "回帰分析";

      if (state.propertyType === "landBuilding") {
        contractBasePrice = Math.max(contractBaseUnitPrice * numberValue("landArea") + buildingCost.price, 0);
        landMethodResult = "取引比較法：土地 " + numberValue("landArea") + "㎡ × " + (Math.round(contractBaseUnitPrice * 10) / 10).toLocaleString("ja-JP") + "万円/㎡";
        pricingMethod = "土地：取引比較法 / 建物：原価法";
      } else {
        contractBasePrice = Math.max(contractBaseUnitPrice * numberValue("targetArea"), 0);
        landMethodResult = state.propertyType === "land" ? "取引比較法" : "-";
      }

      if (!contractBasePrice) {
        showMessage("条件に合う事例がありませんでした。住所・年・対象地域を確認してください。");
        return;
      }

      state.detectedMarketTrend = data.detectedMarketTrend || "flat";
      state.detectedLiquidity = data.detectedLiquidity || "normal";

      var adjustments = buildAdjustmentLists();
      var conditionAdjustmentTotal = sumAdjustments(adjustments, "物件条件");
      var badConditionRaw = sumAdjustments(adjustments, "悪条件");
      var badConditionCapped = clampNegativeAdjustment(badConditionRaw, badConditionCapForType(state.propertyType));
      var marketCoefficient = marketCoefficientForType(state.propertyType);
      var issueAssessment = issueTextAssessment(value("issuePropertyNote"));

      var conditionAdjustedPrice = applyPercent(contractBasePrice, conditionAdjustmentTotal);
      var marketAdjustedPrice = conditionAdjustedPrice * marketCoefficient;
      var finalPrice = Math.max(applyPercent(marketAdjustedPrice, badConditionCapped), 0);

      renderAdjustments(adjustments, badConditionRaw, badConditionCapped);
      updatePriceBreakdown(contractBasePrice, conditionAdjustmentTotal, marketCoefficient, badConditionCapped);

      byId("unitPrice").textContent = contractBaseUnitPrice ? (Math.round(contractBaseUnitPrice * 10) / 10).toLocaleString("ja-JP") : "-";
      byId("weightedUnitPrice").textContent = weightedUnitPrice ? weightedUnitPrice.toLocaleString("ja-JP") : "-";
      byId("pricingMethod").textContent = pricingMethod;
      byId("landMethodResult").textContent = landMethodResult;
      byId("buildingMethodResult").textContent = buildingCost.label;
      byId("regressionSampleCount").textContent = data.regressionSampleCount || "0";
      byId("analysisNote").textContent = data.analysisNote || "-";
      byId("caseCount").textContent = data.caseCount || "0";
      byId("marketTrendLabel").textContent = state.detectedMarketTrend === "up" ? "上向き" : state.detectedMarketTrend === "down" ? "下向き" : "横ばい";
      byId("detectedLiquidityLabel").textContent = state.detectedLiquidity === "high" ? "売りやすい" : state.detectedLiquidity === "low" ? "売りにくい" : "標準";
      byId("resultLiquidityLabel").textContent = byId("detectedLiquidityLabel").textContent;
      renderIssueAssessment(issueAssessment, value("issuePropertyNote"));
      byId("challengePrice").textContent = formatManYen(finalPrice * 1.03);
      byId("recommendedPrice").textContent = formatManYen(finalPrice);
      byId("quickPrice").textContent = formatManYen(finalPrice * 0.94);

      updateCaseScope(data);
      renderTrend(data.trend || []);
      renderCases(data.cases || []);
      showMessage("");
      showResultPage();
    } catch (error) {
      showMessage("査定中にエラーが発生しました。");
    }
  }

  function bindClick(id, handler) {
    var element = byId(id);
    if (element) {
      element.addEventListener("click", handler);
    }
  }

  function initRevealAnimations() {
    var elements = document.querySelectorAll(".reveal");
    if (!elements.length) return;

    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(elements, function (element) {
        element.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.18
    });

    Array.prototype.forEach.call(elements, function (element) {
      observer.observe(element);
    });
  }

  bindClick("lookupPostalCodeButton", lookupPostalCode);
  bindClick("detectAddressButton", detectAddressInfo);
  bindClick("runValuationButton", runValuation);
  bindClick("runValuationButtonInline", runValuation);
  bindClick("backButton", showInputPage);
  bindClick("editButton", showInputPage);
  bindClick("changePropertyTypeButton", showTypeSelectionPage);

  window.lookupPostalCode = lookupPostalCode;
  window.detectAddressInfo = detectAddressInfo;
  window.runValuation = runValuation;
  window.showInputPage = showInputPage;
  window.setPropertyType = setPropertyType;
  window.showTypeSelectionPage = showTypeSelectionPage;
  window.selectPropertyTypeAndContinue = selectPropertyTypeAndContinue;

  setPropertyType("mansion");
  setDetectedAreaText();
  showTypeSelectionPage();
  initRevealAnimations();
})();
