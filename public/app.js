(function () {
  var state = {
    propertyType: "mansion",
    propertyTypeLabel: "中古マンション",
    detectedMarketTrend: "flat",
    detectedLiquidity: "normal",
    detectedPrefecture: "",
    detectedMunicipality: "",
    lastValuation: null
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

  function ensureOption(select, valueName, label) {
    if (!select) return;
    var exists = Array.prototype.some.call(select.options || [], function (option) {
      return option.value === valueName;
    });
    if (!exists) {
      var option = document.createElement("option");
      option.value = valueName;
      option.textContent = label;
      select.appendChild(option);
    }
  }

  function createSelectField(config) {
    var label = document.createElement("label");
    if (config.className) {
      label.className = config.className;
    }

    label.appendChild(document.createTextNode(config.label));

    var select = document.createElement("select");
    select.id = config.id;

    (config.options || []).forEach(function (item, index) {
      var option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      if (index === 0) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    label.appendChild(select);

    if (config.help) {
      var help = document.createElement("span");
      help.className = "help";
      help.textContent = config.help;
      label.appendChild(help);
    }

    return label;
  }

  function saleIntentConfig(intent) {
    if (intent === "challenge") {
      return {
        label: "チャレンジ売り出し価格",
        factor: 1.06,
        rangeSpread: 0.04
      };
    }
    if (intent === "quick") {
      return {
        label: "早期成約・買取想定価格",
        factor: 0.88,
        rangeSpread: 0.06
      };
    }
    return {
      label: "標準売り出し価格",
      factor: 1.03,
      rangeSpread: 0.05
    };
  }

  function confidenceSummary(caseCount, regressionSampleCount) {
    var selectedCount = Number(caseCount || 0);
    var regressionCount = Number(regressionSampleCount || 0);
    var baseCount = Math.max(selectedCount, regressionCount);

    if (baseCount >= 40) {
      return {
        label: "高",
        note: "参照事例 " + baseCount + "件。比較的安定した価格帯です。",
        spread: 0.03
      };
    }
    if (baseCount >= 15) {
      return {
        label: "中",
        note: "参照事例 " + baseCount + "件。一定の参考になりますが、個別条件で上下しやすいです。",
        spread: 0.05
      };
    }
    return {
      label: "低",
      note: "参照事例 " + baseCount + "件。データ不足のため±15%程度のブレが生じる可能性があります。",
      spread: 0.08
    };
  }

  function interiorConditionAdjustment() {
    var score = Number(value("interiorCondition") || 0);
    if (!score) return 0;

    if (state.propertyType === "mansion") {
      return { 1: -8, 2: -3, 3: 0, 4: 2.5, 5: 5 }[score] || 0;
    }
    if (state.propertyType === "landBuilding") {
      return { 1: -10, 2: -4, 3: 0, 4: 3, 5: 6 }[score] || 0;
    }
    return 0;
  }

  function premiumDistrictScore() {
    var address = fullAddress();
    var station = value("stationName");
    var score = 0;

    ["港区", "千代田区", "渋谷区", "中央区", "目黒区", "文京区", "新宿区", "品川区"].forEach(function (name) {
      if (address.indexOf(name) >= 0) score += 1;
    });

    ["広尾", "白金高輪", "麻布十番", "青山一丁目", "六本木", "代官山", "恵比寿", "表参道"].forEach(function (name) {
      if (address.indexOf(name) >= 0 || station.indexOf(name) >= 0) score += 1;
    });

    return score;
  }

  function premiumAdjustmentSummary(baseUnitPrice) {
    var unitPrice = Number(baseUnitPrice || 0);
    var districtScore = premiumDistrictScore();
    var premium = 0;
    var reasons = [];

    if (unitPrice >= 180) {
      premium += state.propertyType === "mansion" ? 8 : 6;
      reasons.push("高単価帯");
    } else if (unitPrice >= 130) {
      premium += state.propertyType === "mansion" ? 5 : 4;
      reasons.push("都心高額帯");
    }

    if (districtScore >= 2) {
      premium += state.propertyType === "mansion" ? 4 : 3;
      reasons.push("都心ブランド立地");
    } else if (districtScore === 1) {
      premium += 2;
      reasons.push("人気立地");
    }

    if (state.propertyType === "mansion") {
      var totalFloors = numberValue("totalFloors");
      var floor = numberValue("floor");
      if (totalFloors >= 20) {
        premium += 3;
        reasons.push("タワー規模");
      }
      if (floor >= 15) {
        premium += 2;
        reasons.push("高層階");
      }
      if (value("viewQuality") === "good") {
        premium += 1;
        reasons.push("眺望良好");
      }
    }

    if (state.propertyType === "landBuilding" && numberValue("buildingTotalArea") >= 120 && numberValue("landArea") >= 80) {
      premium += 2;
      reasons.push("大型住戸");
    }

    var cap = state.propertyType === "mansion" ? 12 : state.propertyType === "land" ? 10 : 11;
    premium = Math.min(premium, cap);

    return {
      percent: premium,
      reason: reasons.length ? reasons.join(" / ") : "該当なし"
    };
  }

  function remodelStepSpec(currentScore, nextScore) {
    var key = String(currentScore) + "-" + String(nextScore);
    var maps = {
      mansion: {
        "1-2": { cost: 250, uplift: 4.5 },
        "2-3": { cost: 120, uplift: 3.5 },
        "3-4": { cost: 200, uplift: 5.5 },
        "4-5": { cost: 450, uplift: 7.5 }
      },
      landBuilding: {
        "1-2": { cost: 400, uplift: 5.5 },
        "2-3": { cost: 180, uplift: 4.5 },
        "3-4": { cost: 260, uplift: 6.5 },
        "4-5": { cost: 700, uplift: 9 }
      }
    };
    return (maps[state.propertyType] || {})[key] || null;
  }

  function renderRemodelRoi() {
    var result = byId("remodelRoiResult");
    var button = byId("remodelRoiButton");
    if (!result || !button) return;

    if (!state.lastValuation || state.propertyType === "land") {
      button.classList.add("hidden");
      result.textContent = "土地は建物リフォームの試算対象外です。";
      return;
    }

    button.classList.remove("hidden");
    var currentScore = Number(value("interiorCondition") || 3);
    var nextScore = Math.min(5, currentScore + 1);
    if (currentScore >= 5) {
      result.textContent = "すでに最上位評価です。これ以上のリフォーム上積み試算はありません。";
      return;
    }

    var spec = remodelStepSpec(currentScore, nextScore);
    if (!spec) {
      result.textContent = "この条件ではリフォーム試算を作れませんでした。";
      return;
    }

    var basePrice = Number(state.lastValuation.displayPrice || 0);
    var upliftAmount = Math.round(basePrice * (spec.uplift / 100));
    var netGain = upliftAmount - spec.cost;
    result.textContent = "★" + currentScore + " → ★" + nextScore + " を想定。工事費 約" + spec.cost.toLocaleString("ja-JP") + "万円、査定上昇 約" + upliftAmount.toLocaleString("ja-JP") + "万円、差引 " + (netGain >= 0 ? "+" : "") + netGain.toLocaleString("ja-JP") + "万円の見込みです。";
  }

  function currentSpecialConditionPreview() {
    var items = [];

    if (value("rebuildable") === "no") items.push({ label: "再建築不可", percent: -30 });
    if (value("rebuildable") === "limited") items.push({ label: "再建築制限あり", percent: -12 });
    if (value("setback") === "needed") items.push({ label: "セットバック要", percent: -7 });
    if (numberValue("roadWidth") > 0 && numberValue("roadWidth") < 4) items.push({ label: "接道4m未満", percent: -8 });
    if (value("roadOwnership") === "private") items.push({ label: "私道負担あり", percent: -5 });
    if (value("landShape") === "irregular") items.push({ label: "不整形地", percent: -10 });
    if (value("landRight") === "leasehold") items.push({ label: "借地権", percent: -24 });
    if (value("landRight") === "fixedLeasehold") items.push({ label: "定期借地権", percent: -30 });
    if (value("landRight") === "shared") items.push({ label: "共有持分・特殊権利", percent: -12 });
    if (value("hazardRisk") === "high") items.push({ label: "高いハザードリスク", percent: -8 });
    if (value("soilRisk") === "medium") items.push({ label: "土壌・擁壁リスク中", percent: -3 });
    if (value("soilRisk") === "high") items.push({ label: "土壌・擁壁リスク高", percent: -8 });
    if (value("renovation") === "needed" && state.propertyType === "landBuilding") items.push({ label: "要大規模リフォーム", percent: -12 });

    return items;
  }

  function refreshSpecialConditionPreview() {
    var element = byId("specialConditionPreview");
    if (!element) return;

    var items = currentSpecialConditionPreview();
    if (!items.length) {
      element.textContent = "大きな減価条件が未選択なら、中立で計算します。";
      return;
    }

    element.textContent = items.map(function (item) {
      return item.label + " " + percentText(item.percent);
    }).join(" / ");
  }

  function ensureEnhancedUi() {
    var issueNote = byId("issuePropertyNote");
    if (issueNote && !byId("saleIntent")) {
      var issueGrid = issueNote.closest(".grid");
      if (issueGrid) {
        var saleIntentField = createSelectField({
          id: "saleIntent",
          className: "full",
          label: "売却の進め方",
          options: [
            { value: "standard", label: "標準売り出しで進めたい" },
            { value: "challenge", label: "じっくり高値で売りたい" },
            { value: "quick", label: "今すぐ売りたい・早めに現金化したい" }
          ],
          help: "結果のメイン表示を、標準・高値狙い・早期売却の見せ方に合わせます。"
        });
        issueGrid.insertBefore(saleIntentField, issueGrid.firstElementChild);

        var previewMeta = document.createElement("div");
        previewMeta.className = "meta full";
        previewMeta.innerHTML = "特殊条件の調整目安: <strong id=\"specialConditionPreview\">大きな減価条件が未選択なら、中立で計算します。</strong><br><span class=\"help\">再建築不可・借地権・接道条件など、入力した条件の減価目安をここにまとめて表示します。</span>";
        issueGrid.appendChild(previewMeta);
      }
    }

    var renovation = byId("renovation");
    if (renovation && !byId("interiorCondition")) {
      var renovationLabel = renovation.closest("label");
      var conditionField = createSelectField({
        id: "interiorCondition",
        label: "室内コンディション 5段階評価",
        options: [
          { value: "3", label: "★3 標準（築年数相応でそのまま住める）" },
          { value: "5", label: "★5 フルリノベ・新築同様（過去3年以内）" },
          { value: "4", label: "★4 美邸・部分リフォーム済み" },
          { value: "2", label: "★2 やや経年劣化（一部修繕が望ましい）" },
          { value: "1", label: "★1 要大規模修繕・荒廃" }
        ],
        help: "築年数だけでなく、室内の使える状態を査定へ反映します。"
      });
      if (renovationLabel && renovationLabel.parentNode) {
        renovationLabel.parentNode.insertBefore(conditionField, renovationLabel);
      }
    }

    var priceMain = document.querySelector(".price-main");
    if (priceMain) {
      var heading = priceMain.querySelector("span");
      if (heading) {
        heading.id = "recommendedPriceLabel";
      }

      if (!byId("priceRangeDisplay")) {
        var range = document.createElement("p");
        range.id = "priceRangeDisplay";
        range.className = "help";
        range.textContent = "成約想定レンジ: -";
        priceMain.appendChild(range);
      }

      if (!byId("confidenceBadge")) {
        var badge = document.createElement("p");
        badge.className = "help";
        badge.innerHTML = "算出信頼度: <strong id=\"confidenceBadge\">-</strong>";
        priceMain.appendChild(badge);
      }

      if (!byId("confidenceNote")) {
        var note = document.createElement("p");
        note.id = "confidenceNote";
        note.className = "help";
        note.textContent = "";
        priceMain.appendChild(note);
      }
    }

    var challengePrice = byId("challengePrice");
    if (challengePrice && !byId("standardPrice")) {
      var challengePlan = challengePrice.closest(".plan");
      var standardPlan = document.createElement("div");
      standardPlan.className = "plan";
      standardPlan.innerHTML = "<span>標準売り出し価格</span><strong id=\"standardPrice\">-</strong>";
      challengePlan.parentNode.insertBefore(standardPlan, challengePlan.nextSibling);
    }

    var marketFactor = byId("marketAdjustmentFactor");
    if (marketFactor && !byId("premiumAdjustmentTotal")) {
      var marketPlan = marketFactor.closest(".plan");
      var premiumPlan = document.createElement("div");
      premiumPlan.className = "plan";
      premiumPlan.innerHTML = "<span>都心・高額帯プレミアム</span><strong id=\"premiumAdjustmentTotal\">-</strong>";
      marketPlan.parentNode.insertBefore(premiumPlan, marketPlan.nextSibling);

      var premiumReasonPlan = document.createElement("div");
      premiumReasonPlan.className = "plan";
      premiumReasonPlan.innerHTML = "<span>プレミアム理由</span><strong id=\"premiumReason\">-</strong>";
      premiumPlan.parentNode.insertBefore(premiumReasonPlan, premiumPlan.nextSibling);
    }

    var issueSummary = byId("issuePropertySummary");
    if (issueSummary && !byId("remodelRoiButton")) {
      var roiWrap = document.createElement("div");
      roiWrap.className = "issue-flag";
      roiWrap.style.marginTop = "16px";
      roiWrap.innerHTML = "<strong>リフォーム投資シミュレーター</strong><p id=\"remodelRoiResult\">査定後に、1段階だけ室内コンディションを上げた場合の差を表示します。</p><button id=\"remodelRoiButton\" type=\"button\" class=\"secondary-button hidden\">リフォーム後を試算する</button>";
      issueSummary.parentNode.insertBefore(roiWrap, issueSummary.nextSibling);
    }
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
    var inlineElement = byId("inlineMessage");
    if (element) {
      element.textContent = text || "";
    }
    if (inlineElement) {
      inlineElement.textContent = text || "";
    }
  }

  function getVisitorId() {
    try {
      var key = "fudosanVisitorId";
      var existing = window.localStorage.getItem(key);
      if (existing) return existing;
      var created = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(key, created);
      return created;
    } catch (error) {
      return "guest_" + Date.now().toString(36);
    }
  }

  async function postAnalytics(url, payload) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
    } catch (error) {
      return null;
    }
    return true;
  }

  function trackVisitOncePerSession() {
    try {
      var sessionKey = "fudosanVisitTracked";
      if (window.sessionStorage.getItem(sessionKey)) return;
      window.sessionStorage.setItem(sessionKey, "1");
    } catch (error) {
      // ignore
    }

    postAnalytics("/api/analytics/visit", {
      visitorId: getVisitorId(),
      path: window.location.pathname
    });
  }

  function trackValuation(propertyType) {
    return postAnalytics("/api/analytics/valuation", {
      visitorId: getVisitorId(),
      propertyType: propertyType || state.propertyType || "mansion"
    });
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

    if (byId("mansionButton")) byId("mansionButton").classList.toggle("active", type === "mansion");
    if (byId("landButton")) byId("landButton").classList.toggle("active", type === "land");
    if (byId("landBuildingButton")) byId("landBuildingButton").classList.toggle("active", type === "landBuilding");

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

    refreshSpecialConditionPreview();
  }

  function setViewStep(step) {
    document.body.classList.remove("app-step-intro", "app-step-input", "app-step-result", "input-hidden", "type-step-active");

    if (step === "result") {
      document.body.classList.add("app-step-result", "input-hidden");
      return;
    }

    if (step === "input") {
      document.body.classList.add("app-step-input");
      return;
    }

    document.body.classList.add("app-step-intro", "type-step-active");
  }

  function showTypeSelectionPage() {
    setViewStep("intro");
    byId("backButton").classList.add("hidden");
    byId("editButton").classList.add("hidden");
    var selector = byId("property-selector");
    if (selector && selector.scrollIntoView) {
      selector.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showPropertyDetailPage() {
    setViewStep("input");
    byId("backButton").classList.add("hidden");
    byId("editButton").classList.add("hidden");
    var form = byId("valuation-form");
    if (form && form.scrollIntoView) {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectPropertyTypeAndContinue(type) {
    setPropertyType(type);
    showPropertyDetailPage();
  }

  function showResultPage() {
    setViewStep("result");
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

  function updateStrengthScenes() {
    var configs = [
      {
        id: "scene-mansion",
        eyebrow: "STRENGTH 01",
        title: "営業前提に寄せない",
        subtitle: "No Sales Pressure",
        description: "まず相場だけ知りたい人が入りやすいように、重たい問い合わせ導線より、静かに価格感を見られる流れを前に置いています。"
      },
      {
        id: "scene-land",
        eyebrow: "STRENGTH 02",
        title: "住所と条件から読み始める",
        subtitle: "Simple Input",
        description: "細かく入れるほど精度は上がりますが、最初から大量の情報を要求せず、住所と基本条件から価格帯を引きにいけます。"
      },
      {
        id: "scene-building",
        eyebrow: "STRENGTH 03",
        title: "比較事例と相場推移まで見る",
        subtitle: "Case Based View",
        description: "1つの価格だけで終わらず、近い事例や相場の流れまで並べて見られるので、売却の温度感までつかみやすくしています。"
      }
    ];

    configs.forEach(function (config) {
      var section = byId(config.id);
      if (!section) return;
      var content = section.querySelector(".scene-content");
      if (!content) return;

      content.innerHTML =
        '<span class="scene-eyebrow" data-scene-reveal="0.3">' + escapeHtml(config.eyebrow) + '</span>' +
        '<h2 data-split-reveal data-scene-reveal="0.4">' + escapeHtml(config.title) + '</h2>' +
        '<p class="scene-subtitle" data-scene-reveal="0.45">' + escapeHtml(config.subtitle) + '</p>' +
        '<p class="scene-desc" data-scene-reveal="0.5">' + escapeHtml(config.description) + '</p>';
    });
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
    addAdjustment(list, "物件条件", "室内コンディション", interiorConditionAdjustment());
  }

  function addLandConditionAdjustments(list) {
    addAdjustment(list, "物件条件", "接道方位", value("roadDirection") === "south" ? 1.5 : 0);
  }

  function addLandBuildingConditionAdjustments(list) {
    addAdjustment(list, "物件条件", "自己利用", value("occupancyStatus") === "ownerChange" ? -4 : 1);
    addAdjustment(list, "物件条件", "リフォーム済み", value("renovation") === "renovated" ? 3 : 0);
    addAdjustment(list, "物件条件", "既存建物の利用可", value("oldBuilding") === "usable" ? 2 : 0);
    addAdjustment(list, "物件条件", "接道方位", value("roadDirection") === "south" ? 1.5 : 0);
    addAdjustment(list, "物件条件", "室内コンディション", interiorConditionAdjustment());
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
    var residualFloor = 0;
    var interiorCondition = Number(value("interiorCondition") || 0);

    if (structureType === "wood" && age >= 20 && interiorCondition >= 3) {
      residualFloor = interiorCondition >= 5 ? 300 : interiorCondition === 4 ? 220 : 120;
      price = Math.max(price, residualFloor);
    }

    return {
      price: price,
      label: "原価法：" + spec.label + " " + spec.cost + "万円/㎡ × " + area + "㎡ × 残存率" + Math.round(remainingRate * 100) + "%" + (residualFloor ? " / 最低残存価値 " + residualFloor + "万円" : "")
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

  function updatePriceBreakdown(contractBasePrice, conditionAdjustmentTotal, marketCoefficient, premiumAdjustmentTotal, premiumReason, badConditionAdjustmentTotal) {
    byId("contractBasePrice").textContent = formatManYen(contractBasePrice);
    byId("conditionAdjustmentTotal").textContent = percentText(conditionAdjustmentTotal);
    byId("marketAdjustmentFactor").textContent = marketCoefficient.toFixed(2) + "倍";
    if (byId("premiumAdjustmentTotal")) byId("premiumAdjustmentTotal").textContent = percentText(premiumAdjustmentTotal);
    if (byId("premiumReason")) byId("premiumReason").textContent = premiumReason || "-";
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
      var premiumSummary = premiumAdjustmentSummary(contractBaseUnitPrice);

      var conditionAdjustedPrice = applyPercent(contractBasePrice, conditionAdjustmentTotal);
      var premiumAdjustedPrice = applyPercent(conditionAdjustedPrice, premiumSummary.percent);
      var marketAdjustedPrice = premiumAdjustedPrice * marketCoefficient;
      var finalPrice = Math.max(applyPercent(marketAdjustedPrice, badConditionCapped), 0);
      var intent = saleIntentConfig(value("saleIntent"));
      var confidence = confidenceSummary(data.caseCount || 0, data.regressionSampleCount || 0);
      var displayPrice = Math.max(finalPrice * intent.factor, 0);
      var rangeSpread = Math.max(intent.rangeSpread, confidence.spread);
      var lowPrice = Math.max(displayPrice * (1 - rangeSpread), 0);
      var highPrice = Math.max(displayPrice * (1 + rangeSpread), 0);
      var challengePriceValue = Math.max(finalPrice * 1.06, 0);
      var standardPriceValue = Math.max(finalPrice * 1.03, 0);
      var quickPriceValue = Math.max(finalPrice * 0.88, 0);

      renderAdjustments(adjustments, badConditionRaw, badConditionCapped);
      updatePriceBreakdown(contractBasePrice, conditionAdjustmentTotal, marketCoefficient, premiumSummary.percent, premiumSummary.reason, badConditionCapped);

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
      byId("challengePrice").textContent = formatManYen(challengePriceValue);
      byId("recommendedPrice").textContent = formatManYen(displayPrice);
      byId("quickPrice").textContent = formatManYen(quickPriceValue);
      if (byId("standardPrice")) byId("standardPrice").textContent = formatManYen(standardPriceValue);
      if (byId("recommendedPriceLabel")) byId("recommendedPriceLabel").textContent = intent.label;
      if (byId("priceRangeDisplay")) byId("priceRangeDisplay").textContent = "成約想定レンジ: " + formatManYen(lowPrice) + " 〜 " + formatManYen(highPrice);
      if (byId("confidenceBadge")) byId("confidenceBadge").textContent = confidence.label + "（参照事例 " + Math.max(Number(data.caseCount || 0), Number(data.regressionSampleCount || 0)) + "件）";
      if (byId("confidenceNote")) byId("confidenceNote").textContent = confidence.note;
      state.lastValuation = {
        contractBasePrice: contractBasePrice,
        conditionAdjustmentTotal: conditionAdjustmentTotal,
        premiumPercent: premiumSummary.percent,
        marketCoefficient: marketCoefficient,
        badConditionPercent: badConditionCapped,
        finalPrice: finalPrice,
        displayPrice: displayPrice
      };
      renderRemodelRoi();

      updateCaseScope(data);
      renderTrend(data.trend || []);
      renderCases(data.cases || []);
      trackValuation(state.propertyType);
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

  ensureEnhancedUi();
  [
    "saleIntent",
    "rebuildable",
    "setback",
    "roadWidth",
    "roadOwnership",
    "landShape",
    "landRight",
    "hazardRisk",
    "soilRisk",
    "renovation",
    "interiorCondition"
  ].forEach(function (id) {
    var element = byId(id);
    if (!element) return;
    element.addEventListener("change", refreshSpecialConditionPreview);
    element.addEventListener("input", refreshSpecialConditionPreview);
  });
  bindClick("remodelRoiButton", renderRemodelRoi);
  updateStrengthScenes();
  setPropertyType("mansion");
  setViewStep("intro");
  setDetectedAreaText();
  initRevealAnimations();
  refreshSpecialConditionPreview();
  trackVisitOncePerSession();

  // Bridge: scene CTA sets window.__selectedPropertyType, sync to app state
  var origSetPropertyType = setPropertyType;
  Object.defineProperty(window, '__selectedPropertyType', {
    set: function (type) {
      var typeMap = { mansion: 'mansion', land: 'land', building: 'landBuilding' };
      var mapped = typeMap[type] || type;
      origSetPropertyType(mapped);
    },
    get: function () { return state.propertyType; }
  });
})();
