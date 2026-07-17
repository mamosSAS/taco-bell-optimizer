# 🌮 Taco Bell Order Optimizer

Pick the food you want; the app finds the cheapest way to order it at nearby
Taco Bells — including buying a box or combo and swapping items inside it
(e.g. the $5 Classic Luxe Box with the taco slot swapped to a Doritos Locos
Taco often beats à la carte). Drinks are ignored.

## Run it

```sh
npm install
npm run dev        # http://localhost:3000
```

Production: `npm run build && npm start`.
Optimizer self-check: `npm test`.

## Docker

Stateless container — no volumes, no environment variables. The only knob is
the host port.

```sh
docker build -t taco-bell-optimizer .
docker run -d --name taco-bell-optimizer -p 3000:3000 --restart unless-stopped taco-bell-optimizer
```

or `docker compose up -d`. Multi-arch note: build on (or for) the target CPU,
e.g. `docker buildx build --platform linux/amd64 -t taco-bell-optimizer .`
when building on Apple Silicon for an x86 server.

### Unraid

A GitHub Actions workflow builds a multi-arch (amd64/arm64) image to
`ghcr.io/mamossas/taco-bell-optimizer:latest` on every push to `main`, and
the template already points at it — no manual registry work.

1. Copy [taco-bell-optimizer.xml](taco-bell-optimizer.xml) to
   `/boot/config/plugins/dockerMan/templates-user/` on the Unraid server.
2. In the Unraid web UI: Docker → Add Container → pick
   **taco-bell-optimizer** from the template dropdown, choose a host port,
   apply. The WebUI link appears on the container.

## How it works

- **Nearby stores**: Taco Bell's public store API by lat/lng (browser
  geolocation, or ZIP via zippopotam.us).
- **Per-store menu + prices**: `tacobell.com/tacobellwebservices/v2/tacobell/products/menu/{storeID}`.
- **Box/combo contents and swap upcharges**: parsed from each product's
  tacobell.com detail page (`?store=` scopes prices to the store).
- **Optimizer** ([lib/optimize.js](lib/optimize.js)): exact search — enumerates every useful
  configuration of every box/combo against your wish list, then finds the
  minimum-cost set of purchases covering *at least* what you asked for
  (extras are treated as free bonuses). Runs independently per store;
  stores are ranked by total.

All data is fetched live from tacobell.com and cached in memory for an hour.
Not affiliated with Taco Bell.

Based on API research from [ben9583/taco-bell-prices](https://github.com/ben9583/taco-bell-prices).
