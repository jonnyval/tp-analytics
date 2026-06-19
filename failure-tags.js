const data = window.ANALYTICS_DATA;
let records = normalizeRecords(asArray(data.records));

function normalizeRecords(rows) {
  return rows.map(row => ({
    ...row,
    ageDays: toNumberOrNull(row.ageDays),
  }));
}

const periodModeSelect = document.getElementById("periodModeSelect");
const periodValueSelect = document.getElementById("periodValueSelect");
const periodValueLabel = document.getElementById("periodValueLabel");
const dateFromInput = document.getElementById("dateFromInput");
const dateToInput = document.getElementById("dateToInput");
const dateFromLabel = document.getElementById("dateFromLabel");
const dateToLabel = document.getElementById("dateToLabel");
const appealCategorySelect = document.getElementById("appealCategorySelect");
const statusSelect = document.getElementById("statusSelect");
const searchInput = document.getElementById("searchInput");
const matrixSortSelect = document.getElementById("matrixSortSelect");
const csvInput = document.getElementById("csvInput");
const csvImportInfo = document.getElementById("csvImportInfo");

function fmt(value, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {maximumFractionDigits: digits}).format(value ?? 0);
}

function fillControls() {
  fillPeriodControl();
  appealCategorySelect.innerHTML = `<option value="__all__">Все категории</option>` +
    unique(records.map(r => r.appealCategory || "(пусто)")).sort((a, b) => a.localeCompare(b, "ru")).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if ([...appealCategorySelect.options].some(option => option.value === "ОтказПрогПрософт")) {
    appealCategorySelect.value = "ОтказПрогПрософт";
  }
  statusSelect.innerHTML = `<option value="__all__">Все статусы</option>`;
  appendOptions(statusSelect, unique(records.map(r => r.status || "(пусто)")));
  const dates = records.map(r => r.closedAt).filter(Boolean).sort();
  dateFromInput.value = dates[0] || "";
  dateToInput.value = dates.at(-1) || "";
  document.getElementById("sourceInfo").textContent = `${data.source}, обновлено ${data.generatedAt}`;
  updatePeriodVisibility();
}

function refillControls() {
  fillControls();
  render();
}

function appendOptions(select, values) {
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
  const category = appealCategorySelect.value;
  const status = statusSelect.value;
  const query = searchInput.value.trim().toLowerCase();
  return records.filter(row => {
    if (!matchesPeriod(row)) return false;
    if (category !== "__all__" && (row.appealCategory || "(пусто)") !== category) return false;
    if (status !== "__all__" && (row.status || "(пусто)") !== status) return false;
    if (query && !`${row.code} ${row.title} ${row.client} ${row.executor} ${row.qualityTags}`.toLowerCase().includes(query)) return false;
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
  const tagged = rows.filter(r => String(r.qualityTags || "").trim());
  const ages = rows.map(r => r.ageDays).filter(Number.isFinite);
  const categories = unique(rows.map(r => r.appealCategory || "(пусто)")).length;
  document.getElementById("kpis").innerHTML = [
    ["Обращений", fmt(rows.length), `${fmt(categories)} категорий`, "Количество обращений в выбранном периоде, категории и статусе."],
    ["С тегами качества", fmt(tagged.length), `${fmt(rows.length ? tagged.length / rows.length * 100 : 0, 1)}% выборки`, "Обращения, где найден хотя бы один тег качества из словаря."],
    ["Медиана закрытия", `${fmt(median(ages), 1)} дн.`, `P90 ${fmt(percentileValue(ages, 90), 1)} дн.`, "Время от создания до закрытия обращения."],
    ["Тегов в словаре", fmt((data.qualityTags || []).length), "продуктовый справочник", "Количество тегов качества, доступных в справочнике."],
  ].map(kpiHtml).join("");
}

function renderMatrix(rows) {
  const tags = unique(splitValues(rows.flatMap(row => row.qualityTags || "")));
  const categories = unique(rows.map(row => row.appealCategory || "(пусто)"));
  const count = new Map();
  const tagTotals = new Map(tags.map(tag => [tag, 0]));
  const categoryTotals = new Map(categories.map(category => [category, 0]));

  rows.forEach(row => {
    const rowTags = splitValues([row.qualityTags || ""]);
    const category = row.appealCategory || "(пусто)";
    rowTags.forEach(tag => {
      const key = `${tag}|||${category}`;
      count.set(key, (count.get(key) || 0) + 1);
      tagTotals.set(tag, (tagTotals.get(tag) || 0) + 1);
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
    });
  });

  const sortedTags = sortMatrixLabels(tags, tagTotals);
  const sortedCategories = sortMatrixLabels(categories, categoryTotals);

  document.getElementById("matrixMeta").textContent = `${fmt(sortedTags.length)} тегов x ${fmt(sortedCategories.length)} категорий`;
  document.getElementById("matrixHead").innerHTML = `<tr><th>Тег качества</th>${sortedCategories.map(c => `<th title="Итого: ${fmt(categoryTotals.get(c) || 0)}">${escapeHtml(c)}</th>`).join("")}<th>Итого</th></tr>`;
  document.getElementById("matrixBody").innerHTML = sortedTags.map(tag => {
    let total = 0;
    const cells = sortedCategories.map(category => {
      const value = count.get(`${tag}|||${category}`) || 0;
      total += value;
      return `<td>${value ? fmt(value) : ""}</td>`;
    }).join("");
    return `<tr><td>${escapeHtml(tag)}</td>${cells}<td><strong>${fmt(total)}</strong></td></tr>`;
  }).join("");
}

function sortMatrixLabels(labels, totals) {
  const mode = matrixSortSelect?.value || "count-desc";
  return labels.slice().sort((a, b) => {
    if (mode === "count-desc") {
      const diff = (totals.get(b) || 0) - (totals.get(a) || 0);
      if (diff !== 0) return diff;
    }
    return a.localeCompare(b, "ru");
  });
}

function renderBreakdowns(rows) {
  renderSimpleBars("qualityTagBars", splitCount(rows, r => r.qualityTags), 14);
  renderSimpleBars("appealCategoryBars", groupCount(rows, r => r.appealCategory || "(пусто)"), 10);
  renderSimpleBars("clientBars", groupCount(rows, r => r.client || "(пусто)"), 10);
  renderSimpleBars("executorBars", groupCount(rows, r => r.executor || "(без исполнителя)"), 10);
  renderPeriodChart(rows);

  const ages = rows.map(r => r.ageDays).filter(Number.isFinite);
  document.getElementById("speedPanel").innerHTML = metricRows([
    ["Медиана", `${fmt(median(ages), 1)} дн.`, "типичное время закрытия"],
    ["P75", `${fmt(percentileValue(ages, 75), 1)} дн.`, "верхняя четверть"],
    ["P90", `${fmt(percentileValue(ages, 90), 1)} дн.`, "длинный хвост"],
  ]);
}

function renderPeriodChart(rows) {
  const unit = periodModeSelect.value === "all" || periodModeSelect.value === "year" ? "quarter" : "month";
  const labels = unique(rows.map(r => unit === "quarter" ? r.quarter : monthKey(r))).sort(unit === "quarter" ? compareQuarter : undefined);
  const counts = groupCount(rows, r => unit === "quarter" ? r.quarter : monthKey(r));
  const max = Math.max(...labels.map(label => counts.get(label) || 0), 1);
  document.getElementById("periodChart").innerHTML = labels.map(label => chartBar(unit === "quarter" ? shortQuarter(label) : displayMonth(label), counts.get(label) || 0, ((counts.get(label) || 0) / max) * 92)).join("");
}

function parseCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(item => item.some(value => String(value).trim()));
}

function csvRowsToRecords(csvRows) {
  if (!csvRows.length) return [];
  const headers = csvRows[0].map(header => header.trim());
  const index = new Map(headers.map((header, i) => [header, i]));
  const field = (row, name) => {
    const i = index.get(name);
    return i === undefined ? "" : String(row[i] ?? "").trim();
  };

  return csvRows.slice(1).map(row => {
    const createdAt = parseDateValue(field(row, "Дата создания"));
    const closedAt = parseDateValue(field(row, "Дата закрытия") || field(row, "Дата смены статуса"));
    const text = [
      field(row, "Наименование"),
      field(row, "Текст без html"),
      field(row, "Текст"),
      field(row, "Тип оборудования РегЛаб"),
      field(row, "Категория обращения РегЛаб"),
      field(row, "Тип обращения РегЛаб"),
    ].join("\n");
    const qualityTags = matchQualityTags(text);
    return {
      code: field(row, "Код"),
      title: field(row, "Наименование"),
      status: field(row, "Статус.Имя статуса") || "Закрыто",
      appealCategory: field(row, "Категория обращения РегЛаб") || "(пусто)",
      reglabCategory: field(row, "Категория обращения РегЛаб") || "",
      reglabTicketType: field(row, "Тип обращения РегЛаб") || "",
      ticketType: field(row, "Тип оборудования РегЛаб") || field(row, "Тип обращения РегЛаб") || "",
      client: field(row, "Контрагент.Наименование"),
      executor: field(row, "Исполнитель.ФИО"),
      rating: field(row, "Оценка"),
      slaOverdue: field(row, "Просрочка SLA РегЛаб.Имя объекта"),
      qualityTags: qualityTags.join("; "),
      qualityTagCount: qualityTags.length,
      closedAt: formatDate(closedAt),
      createdAt: formatDate(createdAt),
      ageDays: createdAt && closedAt ? (closedAt - createdAt) / 86400000 : null,
      year: closedAt ? closedAt.getFullYear() : null,
      month: closedAt ? closedAt.getMonth() + 1 : null,
      quarter: closedAt ? `${closedAt.getFullYear()} Q${Math.floor(closedAt.getMonth() / 3) + 1}` : "",
      closedHour: closedAt ? closedAt.getHours() : null,
      closedWeekday: closedAt ? closedAt.getDay() : null,
    };
  }).filter(row => row.code && row.quarter);
}

function matchQualityTags(text) {
  const taxonomy = window.QUALITY_TAG_TAXONOMY || {groups: [], aliases: {}};
  const matched = [];
  taxonomy.groups.forEach(group => {
    const productMatched = group.products.some(product => matchesTerm(text, product));
    if (!productMatched) return;
    group.tags.forEach(tag => {
      const aliases = [tag, ...(taxonomy.aliases?.[tag] || [])];
      if (aliases.some(alias => matchesTerm(text, alias))) matched.push(tag);
    });
  });
  return unique(matched);
}

function matchesTerm(text, term) {
  const value = String(term || "").trim();
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = /^[A-Za-z0-9]+$/.test(value) ? `(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)` : escaped;
  return new RegExp(pattern, "i").test(text);
}

function parseDateValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function handleCsvImport(file) {
  if (!file) return;
  const text = await file.text();
  const imported = normalizeRecords(csvRowsToRecords(parseCsv(text)));
  records = imported;
  csvImportInfo.textContent = `${file.name}: ${fmt(imported.length)} строк`;
  refillControls();
}

function renderSimpleBars(elementId, map, limit) {
  const items = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = Math.max(...items.map(item => item[1]), 1);
  document.getElementById(elementId).innerHTML = items.length ? items.map(([name, count]) => `
    <div class="status-row">
      <div class="status-label"><span>${escapeHtml(name)}</span><span>${fmt(count)}</span></div>
      <div class="status-track"><span class="status-all" style="width:${(count / max) * 100}%"></span></div>
    </div>
  `).join("") : `<div class="empty">Нет данных</div>`;
}

function chartBar(label, value, height) {
  return `<button class="bar-col" title="${escapeHtml(label)}: ${escapeHtml(value)}"><span class="bar-track"><span class="bar-value" style="--h:${height}%">${escapeHtml(value)}</span><span class="bar" style="height:${height}%"></span></span><span class="bar-caption">${escapeHtml(label)}</span></button>`;
}

function splitCount(rows, fieldFn) {
  const map = new Map();
  rows.forEach(row => splitValues([fieldFn(row)]).forEach(value => map.set(value, (map.get(value) || 0) + 1)));
  return map;
}

function splitValues(values) {
  return values.join(";").split(";").map(value => value.trim()).filter(Boolean);
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

function displayMonth(value) {
  const [year, month] = value.split("-");
  return `${monthName(Number(month))} ${String(year).slice(2)}`;
}

function monthName(month) {
  return ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][month - 1];
}

function compareQuarter(a, b) {
  const [ay, aq] = a.split(" Q").map(Number);
  const [by, bq] = b.split(" Q").map(Number);
  return ay === by ? aq - bq : ay - by;
}

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null && String(value).trim() !== ""))];
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

function metricRows(items) {
  return items.map(([label, value, hint]) => `<div class="metric-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>`).join("");
}

function kpiHtml([label, value, hint, help]) {
  return `<div class="kpi"><div class="label">${escapeHtml(label)} ${help ? `<button class="help" data-help="${escapeHtml(help)}" type="button">?</button>` : ""}</div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div></div>`;
}

function shortQuarter(label) {
  return label.replace("20", "").replace(" Q", " Q");
}

function toNumberOrNull(value) {
  return value === null || value === undefined || value === "" ? null : Number(value);
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
  renderMatrix(rows);
  renderBreakdowns(rows);
}

fillControls();
render();

[periodModeSelect, periodValueSelect, dateFromInput, dateToInput, appealCategorySelect, statusSelect, searchInput, matrixSortSelect].forEach(element => {
  element.addEventListener("input", () => {
    if (element === periodModeSelect) {
      fillPeriodControl();
      updatePeriodVisibility();
    }
    render();
  });
});

document.getElementById("printButton").addEventListener("click", () => window.print());
csvInput.addEventListener("change", event => handleCsvImport(event.target.files?.[0]).catch(error => {
  csvImportInfo.textContent = `Ошибка импорта: ${error.message}`;
}));
