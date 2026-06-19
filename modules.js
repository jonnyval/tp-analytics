const data = window.MODULE_ANALYTICS_DATA || {records: [], moduleRecords: [], modules: [], summary: {}};
const rows = asArray(data.moduleRecords).map(row => ({
  ...row,
  ageDays: toNumberOrNull(row.ageDays),
  year: Number(row.year),
  month: Number(row.month),
}));

const periodModeSelect = document.getElementById("periodModeSelect");
const periodValueSelect = document.getElementById("periodValueSelect");
const periodValueLabel = document.getElementById("periodValueLabel");
const dateFromInput = document.getElementById("dateFromInput");
const dateToInput = document.getElementById("dateToInput");
const dateFromLabel = document.getElementById("dateFromLabel");
const dateToLabel = document.getElementById("dateToLabel");
const moduleSelect = document.getElementById("moduleSelect");
const familySelect = document.getElementById("familySelect");
const functionSelect = document.getElementById("functionSelect");
const statusSelect = document.getElementById("statusSelect");
const categorySelect = document.getElementById("categorySelect");
const searchInput = document.getElementById("searchInput");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmt(n, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {maximumFractionDigits: digits}).format(n ?? 0);
}

function fillControls() {
  fillPeriodControl();
  fillSelect(moduleSelect, unique(rows.map(row => row.module)).sort((a, b) => a.localeCompare(b, "ru")));
  fillSelect(familySelect, unique(rows.map(row => row.productFamily || "(пусто)")).sort((a, b) => a.localeCompare(b, "ru")));
  fillSelect(functionSelect, unique(rows.map(row => row.moduleFunction || "(пусто)")).sort((a, b) => a.localeCompare(b, "ru")));
  fillSelect(statusSelect, unique(rows.map(row => row.status || "(пусто)")).sort((a, b) => a.localeCompare(b, "ru")));
  fillSelect(categorySelect, unique(rows.map(row => row.appealCategory || "(пусто)")).sort((a, b) => a.localeCompare(b, "ru")));
  const dates = rows.map(row => row.closedAt).filter(Boolean).sort();
  dateFromInput.value = dates[0] || "";
  dateToInput.value = dates.at(-1) || "";
  document.getElementById("sourceInfo").textContent = `${data.source || "нет CSV"}, обновлено ${data.generatedAt || "нет данных"}`;
  updatePeriodVisibility();
}

function fillSelect(select, values) {
  select.innerHTML += values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function fillPeriodControl() {
  const mode = periodModeSelect.value;
  const values = periodValues(mode);
  periodValueSelect.innerHTML = values.map((value, index) => `<option value="${escapeHtml(value)}" ${index === values.length - 1 ? "selected" : ""}>${escapeHtml(periodLabel(mode, value))}</option>`).join("");
}

function periodValues(mode) {
  if (mode === "year") return unique(rows.map(row => String(row.year)).filter(Boolean)).sort();
  if (mode === "quarter") return unique(rows.map(row => row.quarter).filter(Boolean)).sort(compareQuarter);
  if (mode === "month") return unique(rows.map(monthKey).filter(Boolean)).sort();
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
  const selectedModule = moduleSelect.value;
  const family = familySelect.value;
  const fn = functionSelect.value;
  const status = statusSelect.value;
  const category = categorySelect.value;
  const query = searchInput.value.trim().toLowerCase();

  return rows.filter(row => {
    if (!matchesPeriod(row)) return false;
    if (selectedModule !== "__all__" && row.module !== selectedModule) return false;
    if (family !== "__all__" && (row.productFamily || "(пусто)") !== family) return false;
    if (fn !== "__all__" && (row.moduleFunction || "(пусто)") !== fn) return false;
    if (status !== "__all__" && (row.status || "(пусто)") !== status) return false;
    if (category !== "__all__" && (row.appealCategory || "(пусто)") !== category) return false;
    if (query && !`${row.code} ${row.title} ${row.client} ${row.executor} ${row.coexecutors} ${row.module}`.toLowerCase().includes(query)) return false;
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

function render() {
  const current = filteredRows();
  renderKpis(current);
  renderBars(current);
  renderTrend(current);
  renderCrossTables(current);
  renderCoverage();
  renderTickets(current);
}

function renderKpis(current) {
  const uniqueTickets = unique(current.map(row => row.code || `${row.module}|${row.title}`)).length;
  const modules = unique(current.map(row => row.module)).length;
  const failures = unique(current.filter(row => row.isFailure).map(row => row.code || `${row.module}|${row.title}`)).length;
  const ages = current.map(row => row.ageDays).filter(Number.isFinite);
  const families = unique(current.map(row => row.productFamily || "(пусто)")).length;
  document.getElementById("moduleKpis").innerHTML = [
    ["Обращений", fmt(uniqueTickets), `${fmt(current.length)} упоминаний модулей`, "Одно обращение может относиться к нескольким модулям."],
    ["Модулей", fmt(modules), `${fmt(families)} семейств`, "Количество уникальных модулей в текущей выборке."],
    ["Отказов", fmt(failures), `${fmt(uniqueTickets ? failures / uniqueTickets * 100 : 0, 1)}% от обращений`, "Отказами считаются обращения, где категория содержит слово «Отказ»."],
    ["Медиана закрытия", `${fmt(median(ages), 1)} дн.`, `среднее ${fmt(average(ages), 1)} дн.`, "Срок от создания до закрытия обращения."],
  ].map(kpiHtml).join("");
}

function renderBars(current) {
  renderSimpleBars("failureModuleBars", countBy(current.filter(row => row.isFailure), row => row.module), 14);
  renderSimpleBars("familyBars", countBy(current, row => row.productFamily || "(пусто)"), 10);
  renderSimpleBars("functionBars", countBy(current, row => row.moduleFunction || "(пусто)"), 10);
  renderSimpleBars("categoryBars", countBy(current, row => row.appealCategory || "(пусто)"), 10);
  document.getElementById("failureMeta").textContent = `${fmt(current.filter(row => row.isFailure).length)} упоминаний`;
}

function renderTrend(current) {
  const unit = periodModeSelect.value === "all" || periodModeSelect.value === "year" ? "quarter" : "month";
  const labels = unique(current.map(row => periodBucket(row, unit)).filter(Boolean)).sort(unit === "quarter" ? compareQuarter : undefined);
  const counts = countBy(current, row => periodBucket(row, unit));
  const failures = countBy(current.filter(row => row.isFailure), row => periodBucket(row, unit));
  const maxValue = Math.max(...labels.map(label => counts.get(label) || 0), 1);
  document.getElementById("trendMeta").textContent = `${labels.length} периодов`;
  document.getElementById("moduleTrendChart").innerHTML = labels.map(label => {
    const total = counts.get(label) || 0;
    const failed = failures.get(label) || 0;
    return chartBar(displayBucket(label, unit), `${fmt(total)} / ${fmt(failed)}`, total / maxValue * 92);
  }).join("");
}

function renderCrossTables(current) {
  renderPairs("moduleCategoryTable", current, row => row.module, row => row.appealCategory || "(пусто)", "Модуль", "Категория");
  renderPairs("moduleClientTable", current, row => row.module, row => row.client || "(пусто)", "Модуль", "Клиент");
}

function renderCoverage() {
  const coverage = data.coverage || {};
  const failureTickets = coverage.failureTickets || 0;
  const failureMatched = coverage.failureMatchedTickets || 0;
  const unmatched = coverage.failureUnmatchedTickets || 0;
  const share = failureTickets ? failureMatched / failureTickets * 100 : 0;
  const categories = asArray(coverage.unmatchedFailureCategories).slice(0, 5).map(item => `${item.name}: ${fmt(item.count)}`).join("<br>");
  const types = asArray(coverage.unmatchedFailureTicketTypes).slice(0, 5).map(item => `${item.name}: ${fmt(item.count)}`).join("<br>");
  document.getElementById("coveragePanel").innerHTML = `
    <div class="metric"><span>Отказов с модулем</span><b>${fmt(failureMatched)} из ${fmt(failureTickets)}</b><small>${fmt(share, 1)}% покрытия</small></div>
    <div class="metric"><span>Отказов без модуля</span><b>${fmt(unmatched)}</b><small>нужно смотреть алиасы или текст обращения</small></div>
    <div class="metric"><span>Категории без модуля</span><b>${categories || "нет"}</b><small>топ непромаркированных отказов</small></div>
    <div class="metric"><span>Типы без модуля</span><b>${types || "нет"}</b><small>где чаще нет конкретного артикула</small></div>
  `;

  const examples = asArray(coverage.unmatchedFailureExamples).slice(0, 30);
  document.getElementById("unmatchedFailureTable").innerHTML = `
    <thead><tr><th>Код</th><th>Дата</th><th>Категория</th><th>Тип</th><th>Тема</th></tr></thead>
    <tbody>${examples.map(row => `
      <tr>
        <td>${escapeHtml(row.code)}</td>
        <td>${escapeHtml(row.closedAt)}</td>
        <td>${escapeHtml(row.appealCategory)}</td>
        <td>${escapeHtml(row.ticketType)}</td>
        <td>${escapeHtml(row.title)}</td>
      </tr>
    `).join("")}</tbody>
  `;
}

function renderPairs(id, current, firstFn, secondFn, firstTitle, secondTitle) {
  const map = new Map();
  current.forEach(row => {
    const key = `${firstFn(row)}\u0000${secondFn(row)}`;
    const item = map.get(key) || {first: firstFn(row), second: secondFn(row), rows: []};
    item.rows.push(row);
    map.set(key, item);
  });
  const items = [...map.values()].sort((a, b) => b.rows.length - a.rows.length).slice(0, 40);
  document.getElementById(id).innerHTML = `
    <thead><tr><th>${firstTitle}</th><th>${secondTitle}</th><th>Обращений</th><th>Отказов</th><th>Медиана дней</th></tr></thead>
    <tbody>${items.map(item => {
      const ages = item.rows.map(row => row.ageDays).filter(Number.isFinite);
      return `<tr><td>${escapeHtml(item.first)}</td><td>${escapeHtml(item.second)}</td><td>${fmt(item.rows.length)}</td><td>${fmt(item.rows.filter(row => row.isFailure).length)}</td><td>${fmt(median(ages), 1)}</td></tr>`;
    }).join("")}</tbody>
  `;
}

function renderTickets(current) {
  const sorted = [...current].sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt))).slice(0, 300);
  document.getElementById("ticketTableMeta").textContent = `показано ${fmt(sorted.length)} из ${fmt(current.length)}`;
  document.getElementById("ticketTable").innerHTML = `
    <thead><tr><th>Код</th><th>Дата</th><th>Модуль</th><th>Категория</th><th>Тема</th><th>Клиент</th><th>Исполнитель</th><th>Соисполнители</th><th>Дней</th></tr></thead>
    <tbody>${sorted.map(row => `
      <tr>
        <td>${escapeHtml(row.code)}</td>
        <td>${escapeHtml(row.closedAt)}</td>
        <td>${escapeHtml(row.module)}</td>
        <td>${escapeHtml(row.appealCategory)}</td>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.client)}</td>
        <td>${escapeHtml(row.executor)}</td>
        <td>${escapeHtml(row.coexecutors)}</td>
        <td>${Number.isFinite(row.ageDays) ? fmt(row.ageDays, 1) : ""}</td>
      </tr>
    `).join("")}</tbody>
  `;
}

function renderSimpleBars(id, map, limit) {
  const items = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = Math.max(...items.map(item => item[1]), 1);
  document.getElementById(id).innerHTML = items.length ? items.map(([name, count]) => `
    <div class="metric-bar-row">
      <div class="metric-bar-label"><span>${escapeHtml(name)}</span><b>${fmt(count)}</b></div>
      <div class="metric-bar-track"><div class="metric-bar-fill" style="width:${count / max * 100}%"></div></div>
    </div>
  `).join("") : `<div class="empty">Нет данных</div>`;
}

function chartBar(label, value, height) {
  return `<div class="bar-col"><span class="bar-track"><span class="bar-value" style="--h:${height}%">${escapeHtml(value)}</span><span class="bar" style="height:${Math.max(2, height)}%"></span></span><span class="bar-caption">${escapeHtml(label)}</span></div>`;
}

function kpiHtml([label, value, hint, help]) {
  return `<div class="kpi"><div class="label">${escapeHtml(label)} <button class="help" data-help="${escapeHtml(help)}">?</button></div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div></div>`;
}

function periodBucket(row, unit) {
  if (unit === "quarter") return row.quarter || "";
  return monthKey(row);
}

function displayBucket(value, unit) {
  if (unit !== "month" || !value) return value;
  const [year, month] = value.split("-");
  return `${monthName(Number(month)).slice(0, 3)} ${year}`;
}

function monthKey(row) {
  return row.year && row.month ? `${row.year}-${String(row.month).padStart(2, "0")}` : "";
}

function monthName(month) {
  return ["", "январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"][month] || "";
}

function countBy(items, fn) {
  const map = new Map();
  items.forEach(item => {
    const key = fn(item) || "(пусто)";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null && value !== ""))];
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function median(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function compareQuarter(a, b) {
  const pa = String(a).match(/(\d{4}) Q(\d)/);
  const pb = String(b).match(/(\d{4}) Q(\d)/);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  return Number(pa[1]) - Number(pb[1]) || Number(pa[2]) - Number(pb[2]);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"}[char]));
}

[periodModeSelect, periodValueSelect, dateFromInput, dateToInput, moduleSelect, familySelect, functionSelect, statusSelect, categorySelect, searchInput].forEach(element => {
  element.addEventListener("input", () => {
    if (element === periodModeSelect) {
      fillPeriodControl();
      updatePeriodVisibility();
    }
    render();
  });
});

document.getElementById("printButton").addEventListener("click", () => window.print());
fillControls();
render();
