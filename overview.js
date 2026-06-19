const data = window.ANALYTICS_DATA;
const records = asArray(data.records).map(r => ({
  ...r,
  month: Number(r.month),
  closedWeekday: Number(r.closedWeekday),
  closedHour: Number(r.closedHour),
  ageDays: toNumberOrNull(r.ageDays),
}));

const periodModeSelect = document.getElementById("periodModeSelect");
const periodValueSelect = document.getElementById("periodValueSelect");
const periodValueLabel = document.getElementById("periodValueLabel");
const dateFromInput = document.getElementById("dateFromInput");
const dateToInput = document.getElementById("dateToInput");
const dateFromLabel = document.getElementById("dateFromLabel");
const dateToLabel = document.getElementById("dateToLabel");
const statusSelect = document.getElementById("statusSelect");
const searchInput = document.getElementById("searchInput");

function fmt(n, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {maximumFractionDigits: digits}).format(n ?? 0);
}

function fillControls() {
  fillPeriodControl();
  fillSelect(statusSelect, unique(records.map(r => r.status || "(пусто)")));
  const dates = records.map(r => r.closedAt).filter(Boolean).sort();
  dateFromInput.value = dates[0] || "";
  dateToInput.value = dates.at(-1) || "";
  document.getElementById("sourceInfo").textContent = `${data.source}, обновлено ${data.generatedAt}`;
  updatePeriodVisibility();
}

function fillSelect(select, values) {
  select.innerHTML += values.sort((a, b) => a.localeCompare(b, "ru")).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function fillPeriodControl() {
  const mode = periodModeSelect.value;
  const values = periodValues(mode);
  periodValueSelect.innerHTML = values.map((value, index) => `<option value="${escapeHtml(value)}" ${index === values.length - 1 ? "selected" : ""}>${escapeHtml(periodLabel(mode, value))}</option>`).join("");
}

function periodValues(mode) {
  if (mode === "year") return unique(records.map(r => String(r.year))).sort();
  if (mode === "quarter") return unique(records.map(r => r.quarter)).sort(compareQuarter);
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
  const status = statusSelect.value;
  const query = searchInput.value.trim().toLowerCase();
  return records.filter(r => {
    if (!matchesPeriod(r)) return false;
    if (status !== "__all__" && (r.status || "(пусто)") !== status) return false;
    if (query && !`${r.code} ${r.title} ${r.client} ${r.ticketType} ${r.appealCategory}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

function matchesPeriod(row) {
  const mode = periodModeSelect.value;
  if (mode === "all") return true;
  if (mode === "year") return String(row.year) === periodValueSelect.value;
  if (mode === "quarter") return row.quarter === periodValueSelect.value;
  if (mode === "month") return monthKey(row) === periodValueSelect.value;
  if (mode === "custom") {
    const date = row.closedAt || "";
    if (dateFromInput.value && date < dateFromInput.value) return false;
    if (dateToInput.value && date > dateToInput.value) return false;
    return true;
  }
  return true;
}

function renderKpis(rows) {
  const ages = rows.map(r => r.ageDays).filter(Number.isFinite);
  const ratings = rows.map(r => parseRating(r.rating)).filter(Number.isFinite);
  const executors = unique(rows.map(r => `${r.login}|${r.executor}`)).length;
  const categories = unique(rows.map(r => r.appealCategory || "(пусто)")).length;

  document.getElementById("overviewKpis").innerHTML = [
    ["Обращений", fmt(rows.length), `${fmt(executors)} исполнителей`, "Количество обращений в выбранном периоде и статусе."],
    ["Медиана закрытия", `${fmt(median(ages), 1)} дн.`, `среднее ${fmt(average(ages), 1)} дн.`, "Время от создания до закрытия. Медиана устойчивее к очень долгим обращениям."],
    ["Категорий", fmt(categories), "уникальных", "Количество уникальных категорий обращений в выбранной выборке."],
    ["Средняя оценка", ratings.length ? fmt(average(ratings), 2) : "нет", `${fmt(ratings.length)} оценок`, "Среднее значение числовых оценок из выгрузки."],
  ].map(kpiHtml).join("");
}

function renderTrends(rows) {
  const unit = trendUnit();
  const labels = unique(rows.map(r => periodBucket(r, unit))).sort(unit === "quarter" ? compareQuarter : undefined);
  const counts = groupCount(rows, r => periodBucket(r, unit));
  const maxCount = Math.max(...labels.map(q => counts.get(q) || 0), 1);
  document.getElementById("trendMeta").textContent = `${labels.length} периодов`;
  document.getElementById("periodTrendChart").innerHTML = labels.map(label => chartBar(displayBucket(label, unit), counts.get(label) || 0, ((counts.get(label) || 0) / maxCount) * 92)).join("");
}

function trendUnit() {
  const mode = periodModeSelect.value;
  if (mode === "all" || mode === "year") return "quarter";
  return "month";
}

function periodBucket(row, unit) {
  return unit === "quarter" ? row.quarter : monthKey(row);
}

function displayBucket(label, unit) {
  if (unit === "quarter") return shortQuarter(label);
  const [year, month] = label.split("-");
  return `${monthName(Number(month))} ${String(year).slice(2)}`;
}

function renderBars(rows) {
  renderSimpleBars("categoryBars", groupCount(rows, r => r.appealCategory || "(пусто)"), 10);
  renderSimpleBars("ticketTypeBars", groupCount(rows, r => r.ticketType || "(пусто)"), 10);
  renderSimpleBars("clientBars", groupCount(rows, r => r.client || "(пусто)"), 10);
  renderSimpleBars("statusBars", groupCount(rows, r => r.status || "(пусто)"), 10);
  renderSimpleBars("ageBars", groupCount(rows, ageBucket), 8);
  renderSimpleBars("qualityTagBars", splitCount(rows, r => r.qualityTags), 10);
  renderWeekdays(rows);
  renderHours(rows);
}

function renderQuality(rows) {
  const slaRows = rows.filter(r => String(r.slaOverdue || "").trim());
  const ratings = rows.map(r => parseRating(r.rating)).filter(Number.isFinite);
  document.getElementById("qualityPanel").innerHTML = metricRows([
    ["SLA-признаки", fmt(slaRows.length), `${fmt(rows.length ? slaRows.length / rows.length * 100 : 0, 1)}% обращений`],
    ["Средняя оценка", ratings.length ? fmt(average(ratings), 2) : "нет", `${fmt(ratings.length)} обращений с оценкой`],
    ["Медианная оценка", ratings.length ? fmt(median(ratings), 2) : "нет", "устойчивее к выбросам"],
  ]);
}

function renderAdditionalMetrics(rows) {
  const clients = [...groupCount(rows, r => r.client || "(пусто)").entries()].sort((a, b) => b[1] - a[1]);
  const categories = [...groupCount(rows, r => r.appealCategory || "(пусто)").entries()].sort((a, b) => b[1] - a[1]);
  const top5Clients = clients.slice(0, 5).reduce((sum, [, count]) => sum + count, 0);
  const top3Categories = categories.slice(0, 3).reduce((sum, [, count]) => sum + count, 0);
  const ages = rows.map(r => r.ageDays).filter(Number.isFinite);
  const ageRows = rows.filter(r => Number.isFinite(r.ageDays));
  const categoryRows = rows.filter(r => String(r.appealCategory || "").trim());
  const clientRows = rows.filter(r => String(r.client || "").trim());
  const ratingRows = rows.filter(r => Number.isFinite(parseRating(r.rating)));

  document.getElementById("concentrationPanel").innerHTML = metricRows([
    ["Топ-5 клиентов", `${fmt(rows.length ? top5Clients / rows.length * 100 : 0, 1)}%`, `${fmt(top5Clients)} обращений`],
    ["Топ-3 категорий", `${fmt(rows.length ? top3Categories / rows.length * 100 : 0, 1)}%`, `${fmt(top3Categories)} обращений`],
    ["Клиентов в выборке", fmt(clients.length), `лидер: ${clients[0]?.[0] || "нет"}`],
  ]);

  document.getElementById("speedPanel").innerHTML = metricRows([
    ["P75 скорости", `${fmt(percentileValue(ages, 75), 1)} дн.`, "75% обращений закрыты не дольше"],
    ["P90 скорости", `${fmt(percentileValue(ages, 90), 1)} дн.`, "длинный хвост закрытия"],
    ["Долгие обращения", `${fmt(rows.length ? rows.filter(r => Number.isFinite(r.ageDays) && r.ageDays >= 14).length / rows.length * 100 : 0, 1)}%`, "14+ дней"],
  ]);

  document.getElementById("dataQualityPanel").innerHTML = metricRows([
    ["Есть возраст", `${fmt(rows.length ? ageRows.length / rows.length * 100 : 0, 1)}%`, "дата создания и закрытия"],
    ["Есть категория", `${fmt(rows.length ? categoryRows.length / rows.length * 100 : 0, 1)}%`, "категория обращения"],
    ["Есть клиент", `${fmt(rows.length ? clientRows.length / rows.length * 100 : 0, 1)}%`, "контрагент заполнен"],
    ["Есть оценка", `${fmt(rows.length ? ratingRows.length / rows.length * 100 : 0, 1)}%`, "поле оценки распознано как число"],
  ]);
}

function renderTables(rows) {
  const matrix = new Map();
  rows.forEach(r => {
    const ticketType = r.ticketType || "(пусто)";
    const category = r.appealCategory || "(пусто)";
    const key = `${ticketType}|||${category}`;
    if (!matrix.has(key)) matrix.set(key, {ticketType, category, rows: []});
    matrix.get(key).rows.push(r);
  });

  document.getElementById("matrixBody").innerHTML = [...matrix.values()]
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 20)
    .map(item => {
      const ages = item.rows.map(r => r.ageDays).filter(Number.isFinite);
      return `<tr><td>${escapeHtml(item.ticketType)}</td><td>${escapeHtml(item.category)}</td><td>${fmt(item.rows.length)}</td><td>${fmt(median(ages), 1)}</td></tr>`;
    }).join("");

  const tagMatrix = new Map();
  rows.forEach(row => {
    String(row.qualityTags || "")
      .split(";")
      .map(tag => tag.trim())
      .filter(Boolean)
      .forEach(tag => {
        const category = row.appealCategory || "(пусто)";
        const key = `${tag}|||${category}`;
        if (!tagMatrix.has(key)) tagMatrix.set(key, {tag, category, rows: []});
        tagMatrix.get(key).rows.push(row);
      });
  });
  document.getElementById("tagCategoryBody").innerHTML = [...tagMatrix.values()]
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 20)
    .map(item => `<tr><td>${escapeHtml(item.tag)}</td><td>${escapeHtml(item.category)}</td><td>${fmt(item.rows.length)}</td></tr>`)
    .join("");
}

function renderWeekdays(rows) {
  const names = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const counts = groupCount(rows, r => names[r.closedWeekday] || "нет даты");
  const ordered = new Map(["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(name => [name, counts.get(name) || 0]));
  renderSimpleBars("weekdayBars", ordered, 7);
}

function renderHours(rows) {
  const buckets = new Map([["00-08", 0], ["08-10", 0], ["10-12", 0], ["12-14", 0], ["14-16", 0], ["16-18", 0], ["18-24", 0]]);
  rows.forEach(r => {
    const h = r.closedHour;
    if (!Number.isFinite(h)) return;
    if (h < 8) buckets.set("00-08", buckets.get("00-08") + 1);
    else if (h < 10) buckets.set("08-10", buckets.get("08-10") + 1);
    else if (h < 12) buckets.set("10-12", buckets.get("10-12") + 1);
    else if (h < 14) buckets.set("12-14", buckets.get("12-14") + 1);
    else if (h < 16) buckets.set("14-16", buckets.get("14-16") + 1);
    else if (h < 18) buckets.set("16-18", buckets.get("16-18") + 1);
    else buckets.set("18-24", buckets.get("18-24") + 1);
  });
  renderSimpleBars("hourBars", buckets, 7);
}

function renderSimpleBars(elementId, map, limit) {
  const items = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = Math.max(...items.map(x => x[1]), 1);
  document.getElementById(elementId).innerHTML = items.length ? items.map(([name, count]) => `
    <div class="status-row">
      <div class="status-label"><span>${escapeHtml(name)}</span><span>${fmt(count)}</span></div>
      <div class="status-track"><span class="status-all" style="width:${(count / max) * 100}%"></span></div>
    </div>
  `).join("") : `<div class="empty">Нет данных</div>`;
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

function splitCount(rows, fieldFn) {
  const map = new Map();
  rows.forEach(row => {
    String(fieldFn(row) || "")
      .split(";")
      .map(value => value.trim())
      .filter(Boolean)
      .forEach(value => map.set(value, (map.get(value) || 0) + 1));
  });
  return map;
}

function ageBucket(row) {
  const days = row.ageDays;
  if (!Number.isFinite(days)) return "нет даты создания";
  if (days < 1) return "< 1 дня";
  if (days < 3) return "1-3 дня";
  if (days < 7) return "3-7 дней";
  if (days < 14) return "1-2 недели";
  if (days < 30) return "2-4 недели";
  if (days < 90) return "1-3 месяца";
  return "> 3 месяцев";
}

function groupCount(rows, keyFn) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyFn(row) || "(пусто)";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function monthKey(row) {
  return row.closedAt ? row.closedAt.slice(0, 7) : "";
}

function compareQuarter(a, b) {
  const [ay, aq] = a.split(" Q").map(Number);
  const [by, bq] = b.split(" Q").map(Number);
  return ay === by ? aq - bq : ay - by;
}

function unique(values) {
  return [...new Set(values.filter(v => v !== undefined && v !== null && String(v).trim() !== ""))];
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentileValue(values, percentile) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function parseRating(value) {
  const normalized = String(value || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return normalized ? Number(normalized[0]) : NaN;
}

function shortQuarter(label) {
  return label.replace("20", "").replace(" Q", " Q");
}

function monthName(month) {
  return ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][month - 1];
}

function toNumberOrNull(value) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function kpiHtml([label, value, hint, help]) {
  return `<div class="kpi"><div class="label">${escapeHtml(label)} ${help ? helpHtml(help) : ""}</div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div></div>`;
}

function helpHtml(text) {
  return `<button class="help" data-help="${escapeHtml(text)}" type="button">?</button>`;
}

function metricRows(items) {
  return items.map(([label, value, hint]) => `<div class="metric-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>`).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || Object.keys(value).length === 0) return [];
  return [value];
}

function render() {
  const rows = filteredRows();
  renderKpis(rows);
  renderTrends(rows);
  renderBars(rows);
  renderQuality(rows);
  renderAdditionalMetrics(rows);
  renderTables(rows);
}

fillControls();
render();

[periodModeSelect, periodValueSelect, dateFromInput, dateToInput, statusSelect, searchInput].forEach(el => {
  el.addEventListener("input", () => {
    if (el === periodModeSelect) {
      fillPeriodControl();
      updatePeriodVisibility();
    }
    render();
  });
});

document.getElementById("printButton").addEventListener("click", () => window.print());
