# DiveFlow AI Context

## Database Source of Truth
- The latest database schema is located at `supabase/schemas/schema.sql`.
- Always refer to this file before suggesting new tables or writing complex SQL queries.

## Tech Stack
- Frontend: Next.js (App Router)
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth (linked to `public.profiles`)

## Core Business Rules (DO NOT BREAK)
1. **The Visit Dependency Rule:** A Client (`clients`) CANNOT be added to a Trip (`trip_clients`) unless they possess an active, overlapping Visit (`visit_clients` -> `visits`) for the exact local date of the trip.
2. **Companion Logic:** Whenever a Client is added to or removed from a Trip, the AI must check `visit_clients` to see if they are traveling with companions, and prompt the user to batch-apply the action to the whole group.