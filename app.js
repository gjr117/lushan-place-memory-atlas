(function () {
  "use strict";

  const data = window.LUSHAN_DATA || { records: [], meta: {} };
  const records = data.records.map((record, index) => ({
    ...record,
    index,
    events: parseEvents(record),
  }));

  // Marker centers are stored in source pixels on the supplied 2400 × 3000
  // canvas. The new terrain basemap uses the same WGS84 extent as the three
  // classification maps, so each category layer can be overlaid directly.
  const mapPoints = {
    人文: {
      1: [1180, 890], 2: [710, 616], 3: [948, 1147], 4: [710, 2255],
      5: [880, 781], 6: [854, 727], 9: [922, 716], 10: [584, 940],
      11: [953, 781], 14: [873, 825], 15: [905, 857], 17: [711, 1578],
      18: [1186, 1320], 21: [1207, 1140], 22: [1160, 1370], 24: [813, 824],
      25: [772, 799], 27: [460, 1457], 28: [735, 765], 29: [785, 1263],
      31: [710, 2205], 33: [883, 1335],
    },
    复合: {
      7: [927, 647], 8: [885, 757], 12: [797, 780], 16: [847, 823],
      20: [996, 985], 23: [631, 717], 26: [503, 1459], 30: [1131, 790],
      32: [1192, 1210],
    },
    自然: {
      13: [676, 1317], 19: [466, 1479],
    },
  };

  const mapCalibration = { x0: 504, lon0: 115.9, pxPerLon: 4910, y0: 1547, lat0: 29.4, pxPerLat: 4620 };

  function pointCoords(pixel) {
    return {
      lon: mapCalibration.lon0 + (pixel[0] - mapCalibration.x0) / mapCalibration.pxPerLon,
      lat: mapCalibration.lat0 - (pixel[1] - mapCalibration.y0) / mapCalibration.pxPerLat,
    };
  }

  const mapMeta = {
    "复合": { title: "复合景观", subtitle: "自然地理与人文记忆交织的景观单元", color: "#a981c4", className: "compound" },
    "人文": { title: "人文景观", subtitle: "宗教、聚落、交通与历史记忆构成的文化空间", color: "#e77856", className: "human" },
    "自然": { title: "自然景观", subtitle: "山体、水系、植被与自然地貌命名的空间档案", color: "#68b8b0", className: "natural" },
  };

  const layerOrder = ["自然", "人文", "复合"];
  const state = { activeTypes: [...layerOrder], year: Number(data.meta.yearMax || 2016), selectedId: null, query: "" };
  const els = {
    mapImage: document.getElementById("mapImage"),
    mapTitle: document.getElementById("mapTitle"),
    mapSubtitle: document.getElementById("mapSubtitle"),
    mapCaption: document.getElementById("mapCaption"),
    mapFrame: document.getElementById("mapFrame"),
    hotspotLayer: document.getElementById("hotspotLayer"),
    selectedPlace: document.getElementById("selectedPlace"),
    recordList: document.getElementById("recordList"),
    recordCount: document.getElementById("recordCount"),
    listCount: document.getElementById("listCount"),
    searchInput: document.getElementById("searchInput"),
    timelineRange: document.getElementById("timelineRange"),
    timelineYearLabel: document.getElementById("timelineYearLabel"),
    timelineEra: document.getElementById("timelineEra"),
    timelineHint: document.getElementById("timelineHint"),
    activeCount: document.getElementById("activeCount"),
    evolutionCount: document.getElementById("evolutionCount"),
  };

  document.getElementById("evolutionCount").textContent = String(data.meta.evolutionCount || records.filter((r) => r.evolution).length);

  function parseEvents(record) {
    if (!record.evolution) return [];
    const text = record.evolution;
    const yearMatches = [];
    const yearRegex = /(?:前\s*)?(\d{3,4})\s*年/g;
    let match;
    while ((match = yearRegex.exec(text))) {
      const prefix = text.slice(Math.max(0, match.index - 3), match.index);
      yearMatches.push(prefix.indexOf("前") >= 0 ? -Number(match[1]) : Number(match[1]));
    }
    const names = [];
    const nameRegex = /[“「『]([^”」』]{2,24})[”」』]/g;
    while ((match = nameRegex.exec(text))) {
      const cleaned = match[1].replace(/[，。；、].*$/, "").trim();
      if (cleaned && !names.includes(cleaned)) names.push(cleaned);
    }
    return names.map((name, index) => ({ year: yearMatches[index] ?? record.year, name }));
  }

  function formatYear(year) {
    if (year == null) return "年代不详";
    return year < 0 ? `前${Math.abs(year)}年` : `${year}年`;
  }

  function eraLabel(year) {
    if (year < 0) return "先秦传说时期";
    if (year < 220) return "秦汉以前";
    if (year < 581) return "魏晋南北朝";
    if (year < 907) return "隋唐时期";
    if (year < 1279) return "宋元时期";
    if (year < 1644) return "明代以前后";
    if (year < 1912) return "清代与近代早期";
    if (year < 1949) return "民国时期";
    if (year < 2000) return "现代建设时期";
    return "当代记录";
  }

  function historicalName(record) {
    if (record.year != null && state.year < record.year) return { name: "尚未得名", note: "当前时间早于该名称的起始记录" };
    if (!record.events.length) return { name: record.name, note: "名称沿用至今" };
    const past = record.events.filter((event) => event.year == null || event.year <= state.year);
    const latest = past[past.length - 1];
    return latest ? { name: latest.name, note: latest.name === record.name ? "名称沿用至今" : `后续演化为“${record.name}”` } : { name: record.name, note: "名称沿用至今" };
  }

  function activeTypes() {
    return state.activeTypes.filter((type) => mapPoints[type]);
  }

  function recordsForTypes(types = activeTypes()) {
    const sourceNos = new Set(types.flatMap((type) => Object.keys(mapPoints[type] || {})));
    return records.filter((record) => sourceNos.has(String(record.sourceNo)));
  }

  function visibleAtTime(record) {
    return record.year == null || record.year <= state.year;
  }

  function filteredList() {
    const query = state.query.trim().toLowerCase();
    return recordsForTypes().filter((record) => {
      if (!query) return true;
      return [record.name, record.category, record.origin, record.start, record.evolution].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }

  function markerStyle(type) {
    return `--point:${mapMeta[type].color};`;
  }

  function recordsInGroup(sourceNo) {
    return records.filter((record) => String(record.sourceNo) === String(sourceNo));
  }

  function mapGroups() {
    return activeTypes().flatMap((type) => Object.entries(mapPoints[type] || {}).map(([sourceNo, point]) => {
      const groupRecords = recordsInGroup(sourceNo);
      return { type, sourceNo, point, records: groupRecords, allRecords: groupRecords };
    })).filter((group) => group.records.length);
  }

  function mapPointForSource(sourceNo) {
    for (const type of activeTypes()) {
      if (mapPoints[type] && mapPoints[type][sourceNo]) return { type, point: mapPoints[type][sourceNo] };
    }
    for (const type of layerOrder) {
      if (mapPoints[type] && mapPoints[type][sourceNo]) return { type, point: mapPoints[type][sourceNo] };
    }
    return null;
  }

  function groupLabel(group) {
    const names = [];
    group.records.filter(visibleAtTime).forEach((record) => {
      const name = historicalName(record).name;
      if (name && name !== "尚未得名" && !names.includes(name)) names.push(name);
    });
    if (!names.length) names.push(historicalName(group.records[0]).name);
    const first = names[0] || `编号${String(group.sourceNo).padStart(3, "0")}`;
    return names.length > 1 ? `${first} · ${names.length}项` : first;
  }

  function renderMap() {
    els.mapImage.src = "lushan-base.png";
    els.mapImage.alt = "庐山地区地名文化景观底图";
    const types = activeTypes();
    const groups = mapGroups();
    els.mapTitle.textContent = "地名文化景观总览";
    els.mapSubtitle.textContent = types.length ? `${types.map((type) => mapMeta[type].title).join("、")}图层叠加展示` : "请选择至少一个景观图层";
    els.mapCaption.textContent = `${types.length} / 3 图层已显示 · ${groups.length} 个编号点`;
    els.mapFrame.style.setProperty("--layer-color", types.length ? mapMeta[types[types.length - 1]].color : "#d9b36b");
    els.hotspotLayer.innerHTML = "";
    const visible = recordsForTypes();
    groups.forEach((group) => {
      const selected = group.records.some((record) => record.id === state.selectedId) || state.selectedId === `group-${group.sourceNo}`;
      const coords = pointCoords(group.point);
      const wrap = document.createElement("div");
      wrap.className = `hotspot-wrap${selected ? " is-selected" : ""}`;
      wrap.style.cssText = `left:${(group.point[0] / 2400) * 100}%;top:${(group.point[1] / 3000) * 100}%;`;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `hotspot ${group.type}${selected ? " is-selected" : ""}${group.records.some(visibleAtTime) ? "" : " is-muted"}`;
      marker.style.cssText = markerStyle(group.type);
      marker.title = `${groupLabel(group)} · 原表序号 ${String(group.sourceNo).padStart(3, "0")} · ${group.records.length} 条记录`;
      marker.setAttribute("aria-label", `查看原表序号${group.sourceNo}档案`);
      marker.addEventListener("click", () => selectGroup(group.sourceNo));
      marker.dataset.lon = coords.lon.toFixed(6);
      marker.dataset.lat = coords.lat.toFixed(6);
      const label = document.createElement("span");
      label.className = "hotspot-label";
      label.textContent = groupLabel(group);
      label.title = marker.title;
      wrap.append(marker, label);
      els.hotspotLayer.appendChild(wrap);
    });
    els.recordCount.textContent = `当前地图 ${groups.length} 个编号点 · ${visible.length} 条档案`;
  }

  function renderList() {
    const list = filteredList();
    els.listCount.textContent = String(list.length);
    els.recordList.innerHTML = "";
    list.forEach((record, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `record-item${record.id === state.selectedId || state.selectedId === `group-${record.sourceNo}` ? " is-active" : ""}${visibleAtTime(record) ? "" : " is-future"}`;
      const currentName = historicalName(record).name;
      item.innerHTML = `<span class="record-index">${String(index + 1).padStart(2, "0")}</span><span class="record-name">${escapeHtml(currentName)}</span><span class="record-type">${escapeHtml(record.category)}</span>`;
      item.addEventListener("click", () => selectRecord(record.id));
      els.recordList.appendChild(item);
    });
  }

  function renderDossier() {
    const record = records.find((item) => item.id === state.selectedId);
    const groupNo = state.selectedId && String(state.selectedId).indexOf("group-") === 0 ? String(state.selectedId).slice(6) : (record ? String(record.sourceNo) : null);
    if (groupNo) {
      const groupRecords = recordsInGroup(groupNo);
      const mapPointInfo = mapPointForSource(groupNo);
      const mapPoint = mapPointInfo ? mapPointInfo.point : null;
      const coords = mapPoint ? pointCoords(mapPoint) : null;
      const list = groupRecords.map((item) => {
        const historic = historicalName(item);
        return `<article class="group-record"><div class="dossier-tag" style="--point:${mapMeta[item.mapType].color}"><i></i>${escapeHtml(item.mapType)} · ${escapeHtml(item.category)}</div><h4>${escapeHtml(historic.name)}</h4><p class="group-record-meta">档案名称：${escapeHtml(item.name)} · ${escapeHtml(item.start || "年代不详")}</p><div class="dossier-copy"><strong>地名由来</strong><br>${escapeHtml(item.origin || "暂无由来记录")}</div>${item.evolution ? `<div class="dossier-copy"><strong>名称演化</strong><br>${escapeHtml(item.evolution)}</div>` : ""}</article>`;
      }).join("");
      const groupColor = mapPointInfo ? mapMeta[mapPointInfo.type].color : "#d9b36b";
      els.selectedPlace.innerHTML = `<div class="dossier-tag" style="--point:${groupColor}"><i></i>原生地图编号 ${String(groupNo).padStart(3, "0")}</div><h3 class="place-title">调查单元 ${String(groupNo).padStart(3, "0")}</h3><p class="place-subtitle">该热点锚定统一底图的编号位置；自然、人文、复合图层可同时显示。同一编号下共 ${groupRecords.length} 条档案。</p>${coords ? `<div class="fact-grid"><div><span class="fact-label">底图标定经度（WGS84）</span><span class="fact-value">${coords.lon.toFixed(6)}°E</span></div><div><span class="fact-label">底图标定纬度（WGS84）</span><span class="fact-value">${coords.lat.toFixed(6)}°N</span></div><div><span class="fact-label">底图像素中心</span><span class="fact-value">${mapPoint[0]} × ${mapPoint[1]} px</span></div><div><span class="fact-label">当前图层档案</span><span class="fact-value">${groupRecords.length} 条</span></div></div>` : ""}<div class="group-records">${list}</div>`;
      return;
    }
    if (!record) {
      els.selectedPlace.innerHTML = `<div class="empty-state"><div class="empty-symbol"><span></span><span></span></div><p>选择地图上的一个点位</p><small>档案详情将在这里展开</small></div>`;
      return;
    }
    const meta = mapMeta[record.mapType] || mapMeta.复合;
    const historic = historicalName(record);
    const evolutionBlock = record.evolution ? `<div class="dossier-copy"><strong>名称演化</strong><br>${escapeHtml(record.evolution)}</div>` : `<div class="dossier-copy"><strong>名称演化</strong><br><span style="color:var(--faint)">调研表暂无连续演化记录，保留当前起名时间与由来。</span></div>`;
    els.selectedPlace.innerHTML = `<div class="dossier-tag" style="--point:${meta.color}"><i></i>${escapeHtml(record.mapType)} · ${escapeHtml(record.category)}</div><h3 class="place-title">${escapeHtml(historic.name)}</h3><p class="place-subtitle">档案名称：${escapeHtml(record.name)} · 原表序号 ${record.sourceNo}</p><div class="fact-grid"><div><span class="fact-label">起名时间</span><span class="fact-value">${escapeHtml(record.start || "年代不详")}</span></div><div><span class="fact-label">时间轴位置</span><span class="fact-value">${formatYear(record.year)}</span></div><div><span class="fact-label">当前时点</span><span class="fact-value">${escapeHtml(historic.note)}</span></div><div><span class="fact-label">调研状态</span><span class="fact-value">${record.evolution ? "有名称演化记录" : "由来记录"}</span></div></div><div class="dossier-copy"><strong>地名由来</strong><br>${escapeHtml(record.origin)}</div>${evolutionBlock}`;
  }

  function renderTimeline() {
    const range = Number(els.timelineRange.value);
    state.year = range;
    els.timelineYearLabel.textContent = formatYear(range).replace("年", "");
    els.timelineEra.textContent = eraLabel(range);
    const active = recordsForTypes().filter(visibleAtTime).length;
    els.activeCount.textContent = String(active);
    els.timelineHint.textContent = range >= Number(data.meta.yearMax || 2016) ? "当前显示所有已知记录；拖动查看名称进入庐山文化景观的时间层" : `${eraLabel(range)} · 已显示在此之前有起名记录的景观`;
    const progress = ((range - Number(els.timelineRange.min)) / (Number(els.timelineRange.max) - Number(els.timelineRange.min))) * 100;
    document.querySelector(".range-track span").style.width = `${Math.max(0, Math.min(100, progress))}%`;
    renderMap();
    renderList();
    renderDossier();
  }

  function selectRecord(id) {
    state.selectedId = id;
    const record = records.find((item) => item.id === id);
    if (record && record.year != null && record.year > state.year) {
      state.year = record.year;
      els.timelineRange.value = String(record.year);
      renderTimeline();
    }
    renderMap();
    renderList();
    renderDossier();
    if (window.innerWidth < 820) els.selectedPlace.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectGroup(sourceNo) {
    state.selectedId = `group-${sourceNo}`;
    renderMap();
    renderList();
    renderDossier();
    if (window.innerWidth < 820) els.selectedPlace.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function changeType(type, checked) {
    const next = state.activeTypes.filter((item) => item !== type);
    if (checked) next.push(type);
    if (!next.length) {
      const input = document.querySelector(`.layer-toggle input[data-type="${type}"]`);
      if (input) input.checked = true;
      return;
    }
    state.activeTypes = layerOrder.filter((item) => next.includes(item));
    document.querySelectorAll(".layer-toggle").forEach((toggle) => {
      const input = toggle.querySelector("input");
      toggle.classList.toggle("is-active", input.checked);
    });
    state.selectedId = null;
    renderMap();
    renderList();
    renderDossier();
    renderTimeline();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  document.querySelectorAll(".layer-toggle input").forEach((input) => input.addEventListener("change", () => changeType(input.dataset.type, input.checked)));
  els.searchInput.addEventListener("input", (event) => { state.query = event.target.value; renderList(); });
  els.timelineRange.addEventListener("input", renderTimeline);
  document.getElementById("timelineReset").addEventListener("click", () => { els.timelineRange.value = els.timelineRange.max; renderTimeline(); });
  document.getElementById("clearSelection").addEventListener("click", () => { state.selectedId = null; renderMap(); renderList(); renderDossier(); });
  document.addEventListener("keydown", (event) => { if (event.key === "/" && document.activeElement !== els.searchInput) { event.preventDefault(); els.searchInput.focus(); } });

  renderMap();
  renderList();
  renderDossier();
  renderTimeline();
})();
