# Wallet Server (Express + Mongoose + M-Pesa Daraja STK Push)

## What is included
- Express server with JWT auth (bcrypt + jsonwebtoken)
- Mongoose models for User and Transaction
- M-Pesa Daraja service (sandbox) for STK Push + webhook handler
- Atomic balance updates via MongoDB transactions (requires replica set in prod)
- Docker & docker-compose for local dev (includes MongoDB)

## Quick start (local)
1. Copy `.env.example` to `.env` and set values (especially MPESA credentials and callback URL).
2. Run with Docker Compose: `docker-compose up --build`
3. API will be available at `http://localhost:4000`

## Files
See `server/src` for controllers, services, models and middlewares.

## Note
This is a starting point. For production:
- Use TLS (HTTPS), secrets manager, and a proper MongoDB replica set for transactions.
- Use a real domain for MPESA_CALLBACK_URL and register it with Safaricom.
