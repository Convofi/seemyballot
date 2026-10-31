# BallotHelper

Type your address. See exactly what's on your ballot. See [VISION.md](VISION.md).

## Run locally

Requires Node 20+.

```sh
npm install
npm run dev      # http://localhost:3000
```

```sh
npm run build    # production build (type-checks)
npm run lint
```

## API

`GET /api/lookup?address=<one-line US address>` — geocodes via the
[US Census Geocoder](https://geocoding.geo.census.gov/geocoder/) and returns
state, county, city, and congressional / state legislative districts.
`400` if `address` is missing, `404` if no match, `502` if the Census service fails.

```sh
curl "http://localhost:3000/api/lookup?address=100+N+High+St+Columbus+OH+43215"
```

No API keys, database, or environment variables are needed.
