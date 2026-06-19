const data = window.ANALYTICS_DATA;
const records = asArray(data.records).map(row => ({
  ...row,
  month: Number(row.month),
}));

const periodModeSelect = document.getElementById("periodModeSelect");
const periodValueSelect = document.getElementById("periodValueSelect");
const periodValueLabel = document.getElementById("periodValueLabel");
const dateFromInput = document.getElementById("dateFromInput");
const dateToInput = document.getElementById("dateToInput");
const dateFromLabel = document.getElementById("dateFromLabel");
const dateToLabel = document.getElementById("dateToLabel");
const statusSelect = document.getElementById("statusSelect");
const categorySelect = document.getElementById("categorySelect");
const categoryTrigger = document.getElementById("categoryTrigger");
const categoryOptions = document.getElementById("categoryOptions");
const categorySummary = document.getElementById("categorySummary");
const equipmentSelect = document.getElementById("equipmentSelect");
const searchInput = document.getElementById("searchInput");
const createdGranularitySelect = document.getElementById("createdGranularitySelect");
const printButton = document.getElementById("printButton");
const printDialog = document.getElementById("printDialog");
const printDialogClose = document.getElementById("printDialogClose");
const printPortraitButton = document.getElementById("printPortraitButton");
const printLandscapeButton = document.getElementById("printLandscapeButton");

const CATEGORY_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#c2410c", "#be123c", "#047857", "#9333ea", "#0e7490"];
const TOTAL_COLOR = "#64748b";

function fmt(value, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {maximumFractionDigits: digits}).format(value ?? 0);
}

function fillControls() {
  fillPeriodControl();
  appendOptions(statusSelect, unique(records.map(row => row.status || "(пусто)")));
  fillCategoryOptions();
  appendOptions(equipmentSelect, unique(records.map(row => row.equipment || "(пусто)")));
  const dates = records.map(row => row.closedAt).filter(Boolean).sort();
  dateFromInput.value = dates[0] || "";
  dateToInput.value = dates.at(-1) || "";
  document.getElementById("sourceInfo").textContent = `${data.source}, обновлено ${data.generatedAt}`;
  updatePeriodVisibility();
}

function appendOptions(select, values) {
  select.innerHTML += values.sort((a, b) => a.localeCompare(b, "ru")).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function fillCategoryOptions() {
  const categories = unique(records.map(row => row.appealCategory || "(пусто)")).sort((a, b) => a.localeCompare(b, "ru"));
  categoryOptions.innerHTML = [
    `<label class="multi-option"><input type="checkbox" value="__all__" checked><span>Все категории</span></label>`,
    ...categories.map(category => `<label class="multi-option"><input type="checkbox" value="${escapeHtml(category)}"><span>${escapeHtml(category)}</span></label>`),
  ].join("");
  updateCategorySummary();
}

function fillPeriodControl() {
  const mode = periodModeSelect.value;
  const values = periodValues(mode);
  periodValueSelect.innerHTML = values.map((value, index) => `<option value="${escapeHtml(value)}" ${index === values.length - 1 ? "selected" : ""}>${escapeHtml(periodLabel(mode, value))}</option>`).join("");
}

function periodValues(mode) {
  if (mode === "year") return unique(records.map(row => String(row.year))).sort();
  if (mode === "quarter") return unique(records.map(row => row.quarter)).sort(compareQuarter);
  if (mode === "month") return unique(records.map(monthKey)).sort();
  return [];
}

function periodLabel(mode, value) {
  if (mode !== "month") return value;
  const [year, month] = value.split("-");
  return `${monthName(Number(month))} ${year}`;
}

function updatePeriodVisibility() {
  const custom = periodModeSelect.value === "custom";
  const all = periodModeSelect.value === "all";
  periodValueLabel.hidden = custom || all;
  dateFromLabel.hidden = !custom;
  dateToLabel.hidden = !custom;
}

function filteredRows() {
  return records.filter(row => matchesCommonFilters(row) && matchesPeriodDate(row.closedAt || ""));
}

function createdRows() {
  return records.filter(row => matchesCommonFilters(row) && matchesPeriodDate(row.createdAt || ""));
}

function createdRowsAllCategories() {
  return records.filter(row => matchesCommonFilters(row, {includeCategory: false}) && matchesPeriodDate(row.createdAt || ""));
}

function matchesCommonFilters(row, options = {}) {
  const includeCategory = options.includeCategory !== false;
  const status = statusSelect.value;
  const categories = selectedCategories();
  const equipment = equipmentSelect.value;
  const query = searchInput.value.trim().toLowerCase();
  if (status !== "__all__" && (row.status || "(пусто)") !== status) return false;
  if (includeCategory && categories.length && !categories.includes(row.appealCategory || "(пусто)")) return false;
  if (equipment !== "__all__" && (row.equipment || "(пусто)") !== equipment) return false;
  if (query && !`${row.code} ${row.title} ${row.client} ${row.appealCategory} ${row.equipment}`.toLowerCase().includes(query)) return false;
  return true;
}

function selectedCategories() {
  const checked = [...categoryOptions.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
  return checked.includes("__all__") ? [] : checked;
}

function matchesPeriodDate(date) {
  const mode = periodModeSelect.value;
  if (mode === "all") return true;
  if (mode === "year") return date.slice(0, 4) === periodValueSelect.value;
  if (mode === "quarter") return dateQuarter(date) === periodValueSelect.value;
  if (mode === "month") return date.slice(0, 7) === periodValueSelect.value;
  if (mode === "custom") {
    if (dateFromInput.value && date < dateFromInput.value) return false;
    if (dateToInput.value && date > dateToInput.value) return false;
    return true;
  }
  return true;
}

function renderKpis(rows) {
  const categories = unique(rows.map(row => row.appealCategory || "(пусто)")).length;
  const equipmentTypes = unique(rows.map(row => row.equipment || "(пусто)")).length;
  const topCategory = topItem(groupCount(rows, row => row.appealCategory || "(пусто)"));
  const topEquipment = topItem(groupCount(rows, row => row.equipment || "(пусто)"));

  document.getElementById("pivotKpis").innerHTML = [
    ["Обращений", fmt(rows.length), periodTitle()],
    ["Категорий", fmt(categories), topCategory ? `лидер: ${topCategory[0]}` : "нет данных"],
    ["Типов оборудования", fmt(equipmentTypes), topEquipment ? `лидер: ${topEquipment[0]}` : "нет данных"],
    ["Покрытие оборудования", `${fmt(rows.length ? rows.filter(row => String(row.equipment || "").trim()).length / rows.length * 100 : 0, 1)}%`, "заполненное поле"],
  ].map(kpiHtml).join("");
}

function renderBreakdowns(rows) {
  const categoryCounts = groupCount(rows, row => row.appealCategory || "(пусто)");
  const equipmentCounts = groupCount(rows, row => row.equipment || "(пусто)");
  document.getElementById("categoryMeta").textContent = `${fmt(categoryCounts.size)} категорий`;
  document.getElementById("equipmentMeta").textContent = `${fmt(equipmentCounts.size)} типов`;
  renderSimpleBars("categoryBars", categoryCounts, 20);
  renderSimpleBars("equipmentBars", equipmentCounts, 20);
}

function renderTimeSeries(openedRows, allCategoryRows) {
  const unit = createdGranularitySelect.value;
  const allCounts = groupCount(allCategoryRows, row => dateBucket(row.createdAt, unit));
  const series = categoryTimeSeries(openedRows, unit);
  const labels = sortedBuckets(unique([...allCounts.keys(), ...series.flatMap(item => [...item.counts.keys()])]), unit);
  const max = Math.max(...labels.map(label => Math.max(allCounts.get(label) || 0, ...series.map(item => item.counts.get(label) || 0))), 1);

  document.getElementById("createdTrendChart").innerHTML = labels.length ? labels.map(label =>
    groupedChartBar(displayBucket(label, unit), series.map(item => ({...item, value: item.counts.get(label) || 0})), allCounts.get(label) || 0, max)
  ).join("") : `<div class="empty">Нет данных</div>`;
  renderTimeSeriesLegend(series);
  renderShareLine(labels, unit, series, allCounts);
}

function categoryTimeSeries(rows, unit) {
  const categories = selectedCategories();
  if (!categories.length) {
    return [{
      name: "Выбранные категории",
      color: CATEGORY_COLORS[0],
      counts: groupCount(rows, row => dateBucket(row.createdAt, unit)),
    }];
  }
  return categories.map((category, index) => ({
    name: category,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    counts: groupCount(rows.filter(row => (row.appealCategory || "(пусто)") === category), row => dateBucket(row.createdAt, unit)),
  }));
}

function renderTimeSeriesLegend(series) {
  document.getElementById("createdTrendLegend").innerHTML = [
    ...series.map(item => `<span><i class="legend-swatch" style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.name)}</span>`),
    `<span><i class="legend-swatch" style="background:${TOTAL_COLOR}"></i>Все обращения</span>`,
  ].join("");
}

function dateBucket(date, unit) {
  if (!date) return "";
  if (unit === "year") return date.slice(0, 4);
  if (unit === "month") return date.slice(0, 7);
  return date.slice(0, 10);
}

function sortedBuckets(values, unit) {
  const clean = values.filter(Boolean);
  return clean.sort();
}

function displayBucket(label, unit) {
  if (unit === "year") return label;
  if (unit === "month") {
    const [year, month] = label.split("-");
    return `${monthName(Number(month))} ${String(year).slice(2)}`;
  }
  const [, month, day] = label.split("-");
  return `${day}.${month}`;
}

function dateQuarter(date) {
  if (!date) return "";
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  return `${year} Q${Math.floor((month - 1) / 3) + 1}`;
}

function chartBar(label, value, height) {
  return `
    <button class="bar-col" title="${escapeHtml(label)}: ${escapeHtml(value)}">
      <span class="bar-track">
        <span class="bar-value" style="--h:${height}%">${escapeHtml(value)}</span>
        <span class="bar" style="height:${height}%"></span>
      </span>
      <span class="bar-caption">${escapeHtml(label)}</span>
    </button>
  `;
}

function groupedChartBar(label, series, total, max) {
  const totalHeight = (total / max) * 92;
  const selectedSum = series.reduce((sum, item) => sum + item.value, 0);
  const share = total ? `${fmt(selectedSum / total * 100, 1)}%` : "0%";
  const basis = Math.max(78, (series.length + 1) * 34 + 24);
  return `
    <button class="bar-col grouped-col" style="flex-basis:${basis}px;min-width:${basis}px" title="${escapeHtml(label)}: выбранные категории ${escapeHtml(selectedSum)}, все обращения ${escapeHtml(total)}, доля ${escapeHtml(share)}">
      <span class="bar-track grouped-track">
        <span class="bar-pair">
          ${series.map(item => `<span class="bar grouped-bar selected-bar" style="height:${(item.value / max) * 92}%;background:${escapeHtml(item.color)}" title="${escapeHtml(item.name)}: ${escapeHtml(item.value)}"><span>${escapeHtml(item.value)}</span></span>`).join("")}
          <span class="bar grouped-bar total-bar" style="height:${totalHeight}%;background:${TOTAL_COLOR}"><span>${escapeHtml(total)}</span></span>
        </span>
      </span>
      <span class="bar-caption">${escapeHtml(label)}<small>${escapeHtml(share)}</small></span>
    </button>
  `;
}

function renderShareLine(labels, unit, series, totalCounts) {
  const seriesPoints = series.map(item => ({
    ...item,
    points: labels.map(label => {
      const selected = item.counts.get(label) || 0;
      const total = totalCounts.get(label) || 0;
      return {
        label,
        display: displayBucket(label, unit),
        selected,
        total,
        share: total ? selected / total * 100 : 0,
      };
    }),
  }));
  const aggregateShares = labels.map(label => {
    const total = totalCounts.get(label) || 0;
    const selected = series.reduce((sum, item) => sum + (item.counts.get(label) || 0), 0);
    return total ? selected / total * 100 : 0;
  });
  const chart = document.getElementById("createdShareChart");
  document.getElementById("createdShareMeta").textContent = labels.length ? `${fmt(avg(aggregateShares), 1)}% в среднем` : "";
  if (!labels.length) {
    chart.innerHTML = `<div class="empty">Нет данных</div>`;
    return;
  }

  const bucketWidth = 86;
  const width = Math.max(720, labels.length * bucketWidth);
  const height = 260;
  const pad = {top: 28, right: 28, bottom: 48, left: 50};
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maxShare = 100;
  const xStep = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;
  const lineSeries = seriesPoints.map(item => ({
    ...item,
    xy: item.points.map((point, index) => ({
    ...point,
    x: pad.left + (labels.length > 1 ? index * xStep : plotWidth / 2),
    y: pad.top + plotHeight - (point.share / maxShare) * plotHeight,
    })),
  }));
  const ticks = [0, 25, 50, 75, 100];

  chart.innerHTML = `
    <svg class="share-svg" style="width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Доля выбранных категорий по периодам">
      ${ticks.map(tick => {
        const y = pad.top + plotHeight - (tick / maxShare) * plotHeight;
        return `<g class="share-grid"><line x1="${pad.left}" y1="${round(y)}" x2="${width - pad.right}" y2="${round(y)}"></line><text x="${pad.left - 10}" y="${round(y + 4)}">${tick}%</text></g>`;
      }).join("")}
      ${lineSeries.map(item => `<path class="share-line" style="stroke:${escapeHtml(item.color)}" d="${item.xy.map((point, index) => `${index ? "L" : "M"} ${round(point.x)} ${round(point.y)}`).join(" ")}"></path>`).join("")}
      ${lineSeries.map(item => item.xy.map(point => `
        <g class="share-point" style="--point-color:${escapeHtml(item.color)}">
          <circle cx="${round(point.x)}" cy="${round(point.y)}" r="4"></circle>
          <title>${escapeHtml(item.name)}, ${escapeHtml(point.display)}: ${escapeHtml(fmt(point.share, 1))}% (${escapeHtml(point.selected)} из ${escapeHtml(point.total)})</title>
        </g>
      `).join("")).join("")}
      ${labels.map((label, index) => index % Math.ceil(labels.length / 14) === 0 ? `<text class="share-x" x="${round(pad.left + (labels.length > 1 ? index * xStep : plotWidth / 2))}" y="${height - 12}">${escapeHtml(displayBucket(label, unit))}</text>` : "").join("")}
    </svg>
  `;
  syncTimeSeriesScroll();
}

function syncTimeSeriesScroll() {
  const barChart = document.getElementById("createdTrendChart");
  const lineChart = document.getElementById("createdShareChart");
  if (!barChart || !lineChart) return;
  let syncing = false;
  barChart.onscroll = () => {
    if (syncing) return;
    syncing = true;
    lineChart.scrollLeft = barChart.scrollLeft;
    syncing = false;
  };
  lineChart.onscroll = () => {
    if (syncing) return;
    syncing = true;
    barChart.scrollLeft = lineChart.scrollLeft;
    syncing = false;
  };
  lineChart.scrollLeft = barChart.scrollLeft;
}

function renderSimpleBars(elementId, map, limit) {
  const items = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")).slice(0, limit);
  const max = Math.max(...items.map(item => item[1]), 1);
  document.getElementById(elementId).innerHTML = items.length ? items.map(([name, count]) => `
    <div class="status-row">
      <div class="status-label"><span>${escapeHtml(name)}</span><span>${fmt(count)}</span></div>
      <div class="status-track"><span class="status-all" style="width:${(count / max) * 100}%"></span></div>
    </div>
  `).join("") : `<div class="empty">Нет данных</div>`;
}

function groupCount(rows, keyFn) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyFn(row) || "(пусто)";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function topItem(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0] || null;
}

function avg(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function monthKey(row) {
  return row.closedAt ? row.closedAt.slice(0, 7) : "";
}

function monthName(month) {
  return ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][month - 1];
}

function compareQuarter(a, b) {
  const [ay, aq] = String(a).split(" Q").map(Number);
  const [by, bq] = String(b).split(" Q").map(Number);
  return ay === by ? aq - bq : ay - by;
}

function periodTitle() {
  const mode = periodModeSelect.value;
  if (mode === "all") return "все время";
  if (mode === "custom") return `${dateFromInput.value || "начало"} - ${dateToInput.value || "конец"}`;
  return periodLabel(mode, periodValueSelect.value);
}

function kpiHtml([label, value, hint]) {
  return `<div class="kpi"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div></div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null && String(value).trim() !== ""))];
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || Object.keys(value).length === 0) return [];
  return [value];
}

function render() {
  const rows = filteredRows();
  const openedRows = createdRows();
  const openedAllCategoryRows = createdRowsAllCategories();
  renderKpis(rows);
  renderTimeSeries(openedRows, openedAllCategoryRows);
  renderBreakdowns(rows);
}

fillControls();
render();

[periodModeSelect, periodValueSelect, dateFromInput, dateToInput, statusSelect, equipmentSelect, searchInput, createdGranularitySelect].forEach(element => {
  element.addEventListener("input", () => {
    if (element === periodModeSelect) {
      fillPeriodControl();
      updatePeriodVisibility();
    }
    render();
  });
});

categoryOptions.addEventListener("change", event => {
  const target = event.target;
  if (!target.matches('input[type="checkbox"]')) return;
  const allInput = categoryOptions.querySelector('input[value="__all__"]');
  const categoryInputs = [...categoryOptions.querySelectorAll('input[type="checkbox"]:not([value="__all__"])')];
  if (target.value === "__all__" && target.checked) {
    categoryInputs.forEach(input => { input.checked = false; });
  } else {
    allInput.checked = !categoryInputs.some(input => input.checked);
  }
  updateCategorySummary();
  render();
});

categoryTrigger.addEventListener("click", () => {
  const nextHidden = !categoryOptions.hidden;
  categoryOptions.hidden = nextHidden;
  categoryTrigger.setAttribute("aria-expanded", String(!nextHidden));
});

document.addEventListener("click", event => {
  if (categorySelect.contains(event.target)) return;
  categoryOptions.hidden = true;
  categoryTrigger.setAttribute("aria-expanded", "false");
});

function updateCategorySummary() {
  const categories = selectedCategories();
  if (!categories.length) {
    categorySummary.textContent = "Все категории";
  } else if (categories.length === 1) {
    categorySummary.textContent = categories[0];
  } else {
    categorySummary.textContent = `${fmt(categories.length)} категории`;
  }
}

printButton.addEventListener("click", () => openPrintDialog());
printDialogClose.addEventListener("click", () => closePrintDialog());
printDialog.addEventListener("click", event => {
  if (event.target === printDialog) closePrintDialog();
});
printPortraitButton.addEventListener("click", () => printReport("portrait"));
printLandscapeButton.addEventListener("click", () => printReport("landscape"));

function openPrintDialog() {
  printDialog.hidden = false;
  printLandscapeButton.focus();
}

function closePrintDialog() {
  printDialog.hidden = true;
}

function printReport(orientation) {
  closePrintDialog();
  document.body.classList.remove("print-portrait", "print-landscape");
  document.body.classList.add(`print-${orientation}`);
  setPrintPageOrientation(orientation);
  requestAnimationFrame(() => window.print());
}

function setPrintPageOrientation(orientation) {
  let style = document.getElementById("dynamicPrintPage");
  if (!style) {
    style = document.createElement("style");
    style.id = "dynamicPrintPage";
    document.head.appendChild(style);
  }
  style.textContent = `@media print { @page { size: A4 ${orientation}; margin: 10mm; } }`;
}

window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-portrait", "print-landscape");
});
