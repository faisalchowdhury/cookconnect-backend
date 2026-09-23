# CookconneKt Backend

REST API for the public site (`../Frontend`) and admin dashboard (`../Dashboard`).

**Stack:** Node.js · Express · TypeScript · MongoDB (Mongoose)

## Prerequisites

- Node.js 20+
- MongoDB 7+ (local or Docker)

## Setup

```bash
cd Backend
cp .env.example .env
npm install
```

Edit `.env` — at minimum set `MONGODB_URI` and the JWT secrets.

## Development

```bash
npm run dev
```

API base URL: `http://localhost:6000/api/v1`

## Tests

```bash
npm run test
```

Uses an in-memory MongoDB instance (no running database required).

## Seed

Populate the database with demo taxonomies, users, profiles, jobs and related data:

```bash
npm run seed
```

| Account | Password | Role |
| --- | --- | --- |
| `admin@nkhedmou.ma` | `Admin123!` | Super admin (all permissions) |
| `moderation@nkhedmou.ma` | `Admin123!` | Photo moderation |
| `offres@nkhedmou.ma` | `Admin123!` | Offers + employers |
| Seeded candidates / employers | `Demo123!` | See seed output for emails |

## Docker

Start MongoDB and the API together:

```bash
docker compose up
```

MongoDB: `localhost:27017` · API: `http://localhost:6000/api/v1`

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run test` | Run Jest test suite |
| `npm run seed` | Seed the database |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
