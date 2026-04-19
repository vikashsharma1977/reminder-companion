# Reminder Companion

AI-powered reminder app with voice input, OCR scanning, location triggers, and smart suggestions.

## Project Structure

```
reminder-companion/
├── backend/          # NestJS API (Node.js + TypeScript)
├── frontend/         # React Native + Expo mobile app
└── docker-compose.yml
```

## Quick Start (Local Development)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — for Postgres, Redis, MinIO
- Node.js 20+

### 1. Start local infrastructure

```bash
docker compose up postgres redis minio -d
```

### 2. Start the backend

```bash
cd backend
cp .env.example .env      # edit API keys if you have them
npm install
npm run start:dev
```

API runs at: `http://localhost:3001/api/v1`

### 3. Start the mobile app

```bash
cd frontend
npm install
npx expo start
```

Scan QR code with **Expo Go** on your phone, or press `i` for iOS Simulator.

---

## Local Services

| Service | URL | Credentials |
|---|---|---|
| API | http://localhost:3001/api/v1 | — |
| PostgreSQL | localhost:5432 | reminder / reminder |
| Redis | localhost:6379 | — |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin |

---

## Key API Endpoints

```
POST   /api/v1/auth/register           Register new user
POST   /api/v1/auth/login              Login → JWT token

POST   /api/v1/reminders               Create reminder
GET    /api/v1/reminders               List active reminders
GET    /api/v1/reminders/today         Today's reminders
PATCH  /api/v1/reminders/:id           Update reminder
PATCH  /api/v1/reminders/:id/complete  Mark as done
DELETE /api/v1/reminders/:id           Delete reminder

POST   /api/v1/parser/text             NL text → structured reminder
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env`. Optional keys:

- `ANTHROPIC_API_KEY` — enables AI parsing (Claude Haiku). Without it, uses basic offline parser.
- `FCM_SERVER_KEY` — enables real push notifications. Without it, notifications log to console.

---

## User Journeys (MVP)

1. **Onboarding → First Reminder** — register, speak, confirm (under 60s)
2. **Voice → Smart Reminder** — NLP parses time, recurrence, category
3. **Image/Prescription → Reminder** — OCR extracts medicine schedule
4. **Location-Based Reminder** — geofence triggers on arrival
5. **Missed Reminder → Smart Suggestion** — detects repeated skips
6. **Daily Re-engagement** — morning digest, evening recap, habit nudges

---

## Security & Compliance

- Secrets via environment variables only (never committed to git)
- JWT with 15-minute expiry + refresh tokens
- Input validation on all endpoints (class-validator)
- GDPR: user data export + deletion (Sprint 7)
- HIPAA: no PHI in logs, image auto-deletion after OCR
