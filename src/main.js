import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./fonts.local.css";
import "./styles.css";

const SERVICES_URL =
  "https://cityimg.capetown.gov.za/erdas-iws/esri/GeoSpatial%20Datasets/rest/services/?f=pjson";
const REST_SERVICES_BASE_URL =
  "https://cityimg.capetown.gov.za/erdas-iws/esri/GeoSpatial%20Datasets/rest/services";
const WMS_URL = "https://cityimg.capetown.gov.za/erdas-iws/ogc/wms/GeoSpatial%20Datasets?";
const DEFAULT_CENTER = [-33.9249, 18.4241];
const DEFAULT_ZOOM = 11;
const MAX_IMAGERY_ZOOM = 24;
const DEFAULT_LAYER_OPACITY = 1;
const DESCRIPTION_DEFAULT_TEXT = "Select an aerial layer to view its description.";
const DESCRIPTION_UNAVAILABLE_TEXT = "Description unavailable for this layer.";

const map = L.map("map", {
  zoomControl: true,
  minZoom: 4,
  maxZoom: MAX_IMAGERY_ZOOM,
  zoomSnap: 1,
  zoomDelta: 1,
  wheelPxPerZoomLevel: 40,
  wheelDebounceTime: 20,
}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

osmLayer.addTo(map);

const state = {
  layers: [],
  activeLayer: null,
  activeLeafletLayer: null,
  opacity: DEFAULT_LAYER_OPACITY,
  descriptionCache: new Map(),
  descriptionRequestId: 0,
};

const layerListEl = document.querySelector("#layer-list");
const searchEl = document.querySelector("#layer-search");
const statusEl = document.querySelector("#status");
const opacitySliderEl = document.querySelector("#opacity-slider");
const opacityValueEl = document.querySelector("#opacity-value");
const descriptionEl = document.querySelector("#layer-description");

function setStatus(message) {
  statusEl.textContent = message;
}

function setDescription(message) {
  descriptionEl.textContent = message;
}

function layerToSlug(layerName) {
  return encodeURIComponent(layerName);
}

function slugToLayer(slug) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return null;
  }
}

function parseYearKey(name) {
  const match = name.match(/(19|20)\d{2}/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function normalizeLayerName(rawName) {
  return rawName
    .replace(/^Aerial Imagery_/, "")
    .replace(/_/g, " ")
    .replace(/\b((?:19|20)\d{2})([A-Za-z]+)/g, "$1 $2")
    .replace(/\.ecw$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapServerMetadataUrl(layerName) {
  return `${REST_SERVICES_BASE_URL}/${encodeURIComponent(layerName)}/MapServer?f=pjson`;
}

function pickLayerDescription(payload) {
  const candidates = [
    payload?.serviceDescription,
    payload?.description,
    payload?.documentInfo?.Comments,
    payload?.documentInfo?.Subject,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const text = candidate.trim();
      if (text.length > 0) {
        return text;
      }
    }
  }

  return DESCRIPTION_UNAVAILABLE_TEXT;
}

async function loadLayerDescription(layer) {
  if (!layer) {
    setDescription(DESCRIPTION_DEFAULT_TEXT);
    return;
  }

  if (state.descriptionCache.has(layer.name)) {
    setDescription(state.descriptionCache.get(layer.name));
    return;
  }

  const requestId = ++state.descriptionRequestId;
  setDescription("Loading description...");

  try {
    const response = await fetch(mapServerMetadataUrl(layer.name));
    if (!response.ok) {
      throw new Error(`MapServer responded with HTTP ${response.status}`);
    }

    const payload = await response.json();
    const description = pickLayerDescription(payload);
    state.descriptionCache.set(layer.name, description);

    if (requestId !== state.descriptionRequestId || state.activeLayer?.name !== layer.name) {
      return;
    }

    setDescription(description);
  } catch {
    if (requestId !== state.descriptionRequestId || state.activeLayer?.name !== layer.name) {
      return;
    }

    setDescription(DESCRIPTION_UNAVAILABLE_TEXT);
  }
}

function clampOpacity(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_LAYER_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

function updateOpacityUi() {
  opacitySliderEl.value = state.opacity.toFixed(2);
  opacityValueEl.textContent = `${Math.round(state.opacity * 100)}%`;
}

function setLayerOpacity(value, options = {}) {
  const { writeUrl = true } = options;

  state.opacity = clampOpacity(value);
  if (state.activeLeafletLayer) {
    state.activeLeafletLayer.setOpacity(state.opacity);
  }
  updateOpacityUi();

  if (writeUrl) {
    writeUrlState();
  }
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const layer = params.get("layer");
  const lat = Number.parseFloat(params.get("lat"));
  const lng = Number.parseFloat(params.get("lng"));
  const z = Number.parseFloat(params.get("z"));
  const opacity = Number.parseFloat(params.get("opacity"));

  return {
    layer: layer ? slugToLayer(layer) : null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    z: Number.isFinite(z) ? z : null,
    opacity: clampOpacity(opacity),
  };
}

function writeUrlState() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const params = new URLSearchParams(window.location.search);

  if (state.activeLayer) {
    params.set("layer", layerToSlug(state.activeLayer.name));
  } else {
    params.delete("layer");
  }
  params.set("lat", center.lat.toFixed(6));
  params.set("lng", center.lng.toFixed(6));
  params.set("z", String(zoom));
  params.set("opacity", state.opacity.toFixed(2));

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", nextUrl);
}

function buildWmsLayer(layerName) {
  return L.tileLayer.wms(WMS_URL, {
    layers: layerName,
    format: "image/webp",
    transparent: true,
    version: "1.1.1",
    srs: "EPSG:3857",
    maxZoom: MAX_IMAGERY_ZOOM,
    attribution: "City of Cape Town",
  });
}

function setActiveLayer(layer, options = {}) {
  const { scrollIntoView = false } = options;

  if (state.activeLayer?.name === layer.name) {
    if (state.activeLeafletLayer) {
      map.removeLayer(state.activeLeafletLayer);
      state.activeLeafletLayer = null;
    }
    state.activeLayer = null;
    renderLayerList(searchEl.value);
    setStatus("No aerial layer selected.");
    setDescription(DESCRIPTION_DEFAULT_TEXT);
    writeUrlState();
    return;
  }

  if (state.activeLeafletLayer) {
    map.removeLayer(state.activeLeafletLayer);
  }

  state.activeLayer = layer;
  state.activeLeafletLayer = buildWmsLayer(layer.name);
  state.activeLeafletLayer.addTo(map);
  state.activeLeafletLayer.setOpacity(state.opacity);
  renderLayerList(searchEl.value);

  if (scrollIntoView) {
    scrollLayerIntoView(layer.name);
  }

  setStatus(`Showing: ${layer.title}`);
  loadLayerDescription(layer);
  writeUrlState();
}

function renderLayerList(filterText = "") {
  const needle = filterText.trim().toLowerCase();
  const filtered = needle
    ? state.layers.filter((layer) => layer.title.toLowerCase().includes(needle))
    : state.layers;

  layerListEl.textContent = "";

  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No layers match your search.";
    empty.className = "status";
    layerListEl.append(empty);
    return;
  }

  for (const layer of filtered) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = layer.title;
    button.dataset.layerName = layer.name;
    button.className = state.activeLayer?.name === layer.name ? "active" : "";
    button.addEventListener("click", () => setActiveLayer(layer));
    li.append(button);
    layerListEl.append(li);
  }
}

function scrollLayerIntoView(layerName) {
  const layerButton = layerListEl.querySelector(`button[data-layer-name="${CSS.escape(layerName)}"]`);
  if (!layerButton) {
    return;
  }

  layerButton.scrollIntoView({ block: "nearest" });
}

async function fetchAerialLayers() {
  const response = await fetch(SERVICES_URL);
  if (!response.ok) {
    throw new Error(`Service responded with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.services)) {
    throw new Error("Unexpected service payload format.");
  }

  const layers = payload.services
    .filter((service) => typeof service.name === "string" && service.name.startsWith("Aerial"))
    .map((service) => {
      const year = parseYearKey(service.name);
      return {
        name: service.name,
        title: normalizeLayerName(service.name),
        year,
      };
    })
    .sort((a, b) => {
      if (a.year !== null && b.year !== null && a.year !== b.year) {
        return b.year - a.year;
      }
      if (a.year !== null && b.year === null) {
        return -1;
      }
      if (a.year === null && b.year !== null) {
        return 1;
      }
      return a.title.localeCompare(b.title);
    });

  if (layers.length === 0) {
    throw new Error("No aerial imagery layers were found.");
  }

  return layers;
}

async function bootstrap() {
  const urlState = readUrlState();

  setDescription(DESCRIPTION_DEFAULT_TEXT);
  setLayerOpacity(urlState.opacity, { writeUrl: false });

  if (urlState.lat !== null && urlState.lng !== null && urlState.z !== null) {
    map.setView([urlState.lat, urlState.lng], urlState.z);
  }

  map.on("moveend", () => writeUrlState());

  try {
    setStatus("Loading aerial layers...");
    state.layers = await fetchAerialLayers();

    renderLayerList();

    const requested = urlState.layer
      ? state.layers.find((layer) => layer.name === urlState.layer)
      : null;

    setActiveLayer(requested || state.layers[0], {
      scrollIntoView: Boolean(requested),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    setStatus(`Unable to load aerial layers: ${details}`);
  }
}

searchEl.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  renderLayerList(target.value);
});

opacitySliderEl.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  setLayerOpacity(Number.parseFloat(target.value));
});

bootstrap();
