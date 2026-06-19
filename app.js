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
const subjectSelect = document.getElementById("subjectSelect");

function fmt(n, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {maximumFractionDigits: digits}).format(n ?? 0);
}

function fillControls() {
  fillPeriodControl("quarter");
  fillSelect(statusSelect, unique(records.map(r => r.status || "(пусто)")));

  const executors = uniqueExecutors(records);
  subjectSelect.innerHTML = executors.map(e => `<option value="${escapeHtml(e.key)}">${escapeHtml(e.name)}</option>`).join("");
  if (executors.length) subjectSelect.value = executors[0].key;

  const minDate = records.map(r => r.closedAt).filter(Boolean).sort()[0] || "";
  const maxDate = records.map(r => r.closedAt).filter(Boolean).sort().at(-1) || "";
  dateFromInput.value = minDate;
  dateToInput.value = maxDate;
  document.getElementById("sourceInfo").textContent = `${data.source}, обновлено ${data.generatedAt}`;
  updatePeriodVisibility();
}

function fillSelect(select, values) {
  select.innerHTML += values.sort((a, b) => a.localeCompare(b, "ru")).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function fillPeriodControl(preferredValue = null) {
  const mode = periodModeSelect.value;
  const values = periodValues(mode);
  periodValueSelect.innerHTML = values.map((value, index) => `<option value="${escapeHtml(value)}" ${index === values.length - 1 ? "selected" : ""}>${escapeHtml(periodLabel(mode, value))}</option>`).join("");
  if (preferredValue && values.includes(preferredValue)) periodValueSelect.value = preferredValue;
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

function selectedRows() {
  const status = statusSelect.value;
  return records.filter(r => {
    if (!matchesPeriod(r)) return false;
    if (status !== "__all__" && (r.status || "(пусто)") !== status) return false;
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

function isSubject(row) {
  return executorKey(row) === subjectSelect.value;
}

function executorKey(row) {
  return `${row.login || ""}|${row.executor || ""}`;
}

function uniqueExecutors(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = executorKey(row);
    if (!map.has(key)) map.set(key, {key, name: row.executor || "(без исполнителя)"});
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function renderKpis(rows) {
  const subjectRows = rows.filter(isSubject);
  const allAges = rows.map(r => r.ageDays).filter(Number.isFinite);
  const ages = subjectRows.map(r => r.ageDays).filter(Number.isFinite);
  const share = rows.length ? (subjectRows.length / rows.length) * 100 : 0;
  const categories = unique(subjectRows.map(r => r.appealCategory || "(пусто)")).length;

  document.getElementById("kpis").innerHTML = [
    ["Закрыто сотрудником", fmt(subjectRows.length), `${fmt(share, 1)}% от выбранного периода`, "Количество обращений выбранного сотрудника с учетом фильтра периода и статуса."],
    ["Всего в периоде", fmt(rows.length), periodTitle(), "Все обращения в выбранном периоде и статусе."],
    ["Медиана скорости", `${fmt(median(ages), 1)} дн.`, `по всем: ${fmt(median(allAges), 1)} дн.`, "Медиана дней от создания до закрытия. Устойчива к единичным очень долгим обращениям."],
    ["Категорий", fmt(categories), "у выбранного сотрудника", "Количество уникальных категорий обращений у выбранного сотрудника."],
  ].map(kpiHtml).join("");
}

function renderCharts() {
  const subjectRows = records.filter(row => isSubject(row) && statusMatches(row));
  const unit = trendUnit();
  const counts = groupCount(subjectRows, row => periodBucket(row, unit));
  const labels = trendLabels(unit).filter(label => (counts.get(label) || 0) > 0);
  const maxCount = Math.max(...labels.map(label => counts.get(label) || 0), 1);
  document.getElementById("countMeta").textContent = `${labels.length} активных периодов`;
  document.getElementById("countChart").innerHTML = labels.map(label => chartBar(displayBucket(label, unit), counts.get(label) || 0, ((counts.get(label) || 0) / maxCount) * 92)).join("");
}

function statusMatches(row) {
  const status = statusSelect.value;
  return status === "__all__" || (row.status || "(пусто)") === status;
}

function trendUnit() {
  const mode = periodModeSelect.value;
  if (mode === "all" || mode === "year") return "quarter";
  return "month";
}

function trendLabels(unit) {
  if (unit === "quarter") return unique(records.map(r => r.quarter)).sort(compareQuarter);
  return unique(records.map(monthKey)).sort();
}

function periodBucket(row, unit) {
  return unit === "quarter" ? row.quarter : monthKey(row);
}

function displayBucket(label, unit) {
  if (unit === "quarter") return shortQuarter(label);
  const [year, month] = label.split("-");
  return `${monthName(Number(month))} ${String(year).slice(2)}`;
}

function renderStability() {
  const unit = trendUnit();
  const subjectRows = records.filter(row => isSubject(row) && statusMatches(row));
  const counts = groupCount(subjectRows, row => periodBucket(row, unit));
  const labels = trendLabels(unit);
  const active = labels.map(label => ({label, count: counts.get(label) || 0})).filter(x => x.count > 0);
  const best = [...active].sort((a, b) => b.count - a.count)[0];
  const worst = [...active].slice(1).sort((a, b) => a.count - b.count)[0];
  const currentLabel = currentPeriodBucket(unit);
  const currentIndex = labels.indexOf(currentLabel);
  const current = counts.get(currentLabel) || 0;
  const previous = currentIndex > 0 ? counts.get(labels[currentIndex - 1]) || 0 : 0;
  const delta = current - previous;
  document.getElementById("stabilityMeta").textContent = subjectName();
  document.getElementById("stabilityPanel").innerHTML = metricRows([
    ["К предыдущему периоду", delta >= 0 ? `+${fmt(delta)}` : fmt(delta), `было ${fmt(previous)}, стало ${fmt(current)}`],
    ["Лучший активный период", best ? displayBucket(best.label, unit) : "нет", `${fmt(best?.count || 0)} закрыто`],
    ["Худший активный период", worst ? displayBucket(worst.label, unit) : "нет", `${fmt(worst?.count || 0)} закрыто, первый активный период не учитывается`],
    ["Среднее / медиана", `${fmt(average(active.map(x => x.count)), 1)} / ${fmt(median(active.map(x => x.count)), 1)}`, `${fmt(active.length)} активных периодов`],
  ]);
}

function currentPeriodBucket(unit) {
  const mode = periodModeSelect.value;
  if (mode === "year") return `${periodValueSelect.value} Q4`;
  if (mode === "quarter") return periodValueSelect.value;
  if (mode === "month") return periodValueSelect.value;
  const rows = selectedRows();
  const latest = rows.map(r => periodBucket(r, unit)).sort().at(-1);
  return latest || "";
}

function renderBreakdowns(rows) {
  const subjectRows = rows.filter(isSubject);
  renderSimpleBars("ticketTypeBars", groupCount(subjectRows, r => r.ticketType || "(пусто)"), 8);
  renderSimpleBars("categoryBars", groupCount(subjectRows, r => r.appealCategory || "(пусто)"), 8);
  renderSimpleBars("clientBars", groupCount(subjectRows, r => r.client || "(пусто)"), 8);
  renderSimpleBars("ageBucketBars", groupCount(subjectRows, ageBucket), 8);
  renderSimpleBars("qualityTagBars", splitCount(subjectRows, r => r.qualityTags), 10);
  renderWeekdays(subjectRows);
  renderHours(subjectRows);
  renderQuality(subjectRows);
}

function renderStatuses(rows) {
  const subjectRows = rows.filter(isSubject);
  const all = [...groupCount(rows, r => r.status || "(пусто)").entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const subject = groupCount(subjectRows, r => r.status || "(пусто)");
  const max = Math.max(...all.map(s => s[1]), 1);
  document.getElementById("statusBars").innerHTML = all.map(([name, count]) => `
    <div class="status-row">
      <div class="status-label"><span>${escapeHtml(name)}</span><span>${fmt(count)} / ${fmt(subject.get(name) || 0)}</span></div>
      <div class="status-track">
        <span class="status-all" style="width:${(count / max) * 100}%"></span>
        <span class="status-target" style="width:${((subject.get(name) || 0) / max) * 100}%"></span>
      </div>
    </div>
  `).join("");
}

function renderMonths(rows) {
  const subjectRows = rows.filter(isSubject);
  const months = monthsForSelectedPeriod();
  const counts = groupCount(subjectRows, monthKey);
  const max = Math.max(...months.map(m => counts.get(m) || 0), 1);
  document.getElementById("monthChart").innerHTML = months.map(m => chartBar(displayBucket(m, "month"), counts.get(m) || 0, ((counts.get(m) || 0) / max) * 92)).join("");
}

function monthsForSelectedPeriod() {
  const mode = periodModeSelect.value;
  if (mode === "month") return [periodValueSelect.value];
  if (mode === "quarter") {
    const [year, quarterPart] = periodValueSelect.value.split(" Q");
    const first = (Number(quarterPart) - 1) * 3 + 1;
    return [first, first + 1, first + 2].map(month => `${year}-${String(month).padStart(2, "0")}`);
  }
  const rows = selectedRows();
  return unique(rows.map(monthKey)).sort();
}

function renderSpeed(rows) {
  const subjectAges = rows.filter(isSubject).map(r => r.ageDays).filter(Number.isFinite);
  const allAges = rows.map(r => r.ageDays).filter(Number.isFinite);
  document.getElementById("speedPanel").innerHTML = metricRows([
    ["Сотрудник, медиана", `${fmt(median(subjectAges), 1)} дн.`, `среднее ${fmt(average(subjectAges), 1)} дн.`],
    ["Все обращения, медиана", `${fmt(median(allAges), 1)} дн.`, `среднее ${fmt(average(allAges), 1)} дн.`],
    ["P90 сотрудника", `${fmt(percentileValue(subjectAges, 90), 1)} дн.`, "90% обращений закрыты не дольше этого значения"],
  ]);
}

function renderQuality(rows) {
  const slaRows = rows.filter(r => String(r.slaOverdue || "").trim());
  const ratings = rows.map(r => parseRating(r.rating)).filter(Number.isFinite);
  document.getElementById("qualityPanel").innerHTML = metricRows([
    ["SLA-признаки", fmt(slaRows.length), `${fmt(rows.length ? (slaRows.length / rows.length) * 100 : 0, 1)}% обращений`],
    ["Средняя оценка", ratings.length ? fmt(average(ratings), 2) : "нет", `${fmt(ratings.length)} обращений с оценкой`],
    ["Медианная оценка", ratings.length ? fmt(median(ratings), 2) : "нет", "устойчивее к выбросам"],
  ]);
}

function renderWeekdays(rows) {
  const names = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const counts = groupCount(rows, r => names[r.closedWeekday] || "нет даты");
  const ordered = new Map(["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(name => [name, counts.get(name) || 0]));
  renderSimpleBars("weekdayBars", ordered, 7);
}

function renderHours(rows) {
  const buckets = new Map([["00-08", 0], ["08-10", 0], ["10-12", 0], ["12-14", 0], ["14-16", 0], ["16-18", 0], ["18-24", 0]]);
  rows.forEach(row => {
    const hour = row.closedHour;
    if (!Number.isFinite(hour)) return;
    if (hour < 8) buckets.set("00-08", buckets.get("00-08") + 1);
    else if (hour < 10) buckets.set("08-10", buckets.get("08-10") + 1);
    else if (hour < 12) buckets.set("10-12", buckets.get("10-12") + 1);
    else if (hour < 14) buckets.set("12-14", buckets.get("12-14") + 1);
    else if (hour < 16) buckets.set("14-16", buckets.get("14-16") + 1);
    else if (hour < 18) buckets.set("16-18", buckets.get("16-18") + 1);
    else buckets.set("18-24", buckets.get("18-24") + 1);
  });
  renderSimpleBars("hourBars", buckets, 7);
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

function monthKey(row) {
  if (!row.closedAt) return "";
  return row.closedAt.slice(0, 7);
}

function monthName(month) {
  return ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][month - 1];
}

function shortQuarter(label) {
  return label.replace("20", "").replace(" Q", " Q");
}

function compareQuarter(a, b) {
  const [ay, aq] = a.split(" Q").map(Number);
  const [by, bq] = b.split(" Q").map(Number);
  return ay === by ? aq - bq : ay - by;
}

function groupCount(rows, keyFn) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyFn(row) || "(пусто)";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
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

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function percentileValue(values, percentile) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function parseRating(value) {
  const normalized = String(value || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return normalized ? Number(normalized[0]) : NaN;
}

function toNumberOrNull(value) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function subjectName() {
  return subjectSelect.options[subjectSelect.selectedIndex]?.text || "выбранный сотрудник";
}

function periodTitle() {
  const mode = periodModeSelect.value;
  if (mode === "all") return "все время";
  if (mode === "custom") return `${dateFromInput.value || "начало"} - ${dateToInput.value || "конец"}`;
  return periodLabel(mode, periodValueSelect.value);
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

function unique(values) {
  return [...new Set(values.filter(v => v !== undefined && v !== null && String(v).trim() !== ""))];
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || Object.keys(value).length === 0) return [];
  return [value];
}

function render() {
  const rows = selectedRows();
  renderKpis(rows);
  renderCharts();
  renderStability();
  renderSpeed(rows);
  renderMonths(rows);
  renderBreakdowns(rows);
  renderStatuses(rows);
}

fillControls();
render();

[periodModeSelect, periodValueSelect, dateFromInput, dateToInput, statusSelect, subjectSelect].forEach(el => {
  el.addEventListener("input", () => {
    if (el === periodModeSelect) {
      fillPeriodControl();
      updatePeriodVisibility();
    }
    render();
  });
});

document.getElementById("printButton").addEventListener("click", () => window.print());
