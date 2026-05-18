# Cape Town Historic Aerial Viewer

A modern Leaflet web app that loads historic aerial imagery from the City of Cape Town services and displays it as WMS layers.

## Features

- Uses Leaflet with WMS tiles from the City endpoint.
- Fetches available layers from the ESRI services JSON endpoint.
- Filters to services whose names start with `Aerial`.
- Searchable left sidebar layer picker with active-layer highlighting.
- Layer opacity control (0-100%).
- Layer metadata/description panel loaded from each service's MapServer metadata.
- Shareable permalink containing selected layer, map center, zoom, and opacity.
- URL-restored layer selection auto-scrolls into view in the sidebar.
- Local font asset generation at build/dev time (no runtime Google Fonts dependency).

## Data Sources

- Services catalog (JSON):
	- `https://cityimg.capetown.gov.za/erdas-iws/esri/GeoSpatial%20Datasets/rest/services/?f=pjson`
- WMS endpoint:
	- `https://cityimg.capetown.gov.za/erdas-iws/ogc/wms/GeoSpatial%20Datasets?`

## Development

Install dependencies:

```bash
npm install
```

Note: `npm run dev` and `npm run build` automatically run `scripts/download-fonts.mjs` first via `predev`/`prebuild`.

Run local development server:

```bash
npm run dev
```

Create production build (static files):

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Container

Build the production image:

```bash
docker build -t coct-aerial-imagery-leaflet:test .
```

Run it locally:

```bash
docker run --rm -p 8080:8080 coct-aerial-imagery-leaflet:test
```

## Permalink Format

The app updates URL query parameters as you interact with the map:

- `layer`: URL-encoded WMS layer name from the services catalog
- `lat`: map center latitude
- `lng`: map center longitude
- `z`: zoom level
- `opacity`: active aerial layer opacity from `0.00` to `1.00`

Example:

`?layer=Aerial%20Imagery_Aerial%20Imagery%202024&lat=-33.924900&lng=18.424100&z=11&opacity=0.85`

Opening a permalink restores the requested layer and map view.

## Automation

- GitHub Pages publish workflow: `.github/workflows/pages-publish.yml`
	- Triggers on pushes to `main` and manual dispatch.
	- Builds with Node 22 and publishes `dist/` via GitHub Pages actions.
- GHCR Docker publish workflow: `.github/workflows/docker-publish.yml`
	- Triggers on pushes to `main` and tags matching `v*`.
	- Publishes images to `ghcr.io/<owner>/<repo>`.
- Dependabot config: `.github/dependabot.yml`
	- Weekly updates for npm, GitHub Actions, and Docker.

## Notes

- This app directly requests remote service endpoints from the browser.
- If the upstream service changes or is unavailable, the app displays an error in the sidebar.
