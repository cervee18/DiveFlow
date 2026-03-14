# DiveFlow Technical Standards

## 1. Core Stack
* **Framework:** Next.js (App Router).
* **Styling:** Tailwind CSS **v4**. (Uses `@import "tailwindcss";`, no `tailwind.config.js` required for basic setups).
* **Database & Auth:** Supabase (PostgreSQL).

## 2. Data Fetching & Supabase
* **Client Components (`"use client"`):** Use `@/utils/supabase/client` to instantiate the Supabase client.
* **Server Components:** Use `@/utils/supabase/server`.
* **Real-time Search:** Use a `useEffect` with a `setTimeout` (approx 300ms) to debounce live searches against the database so we don't spam queries on every keystroke.

## 3. State Management
* Avoid heavy external state libraries (like Redux or Zustand) for simple CRUD operations.
* Use standard React `useState` and `useEffect` for handling form inputs, modal visibility, and local list updates.
* When updating a record via an API/Supabase, update the local React state array immediately so the UI feels instant, rather than forcing a full page reload.

## 4. Form Handling
* Use native HTML `<form>` elements and the `onSubmit` handler.
* Use `new FormData(e.currentTarget)` to extract values natively rather than creating controlled `onChange` states for every single text input.
* Use `key={selectedItem.id}` on forms to force React to remount and apply new `defaultValue`s when switching between selected records.

## 5. Timezone & Date Handling
* **The UTC Trap:** Supabase `timestamp with time zone` (like `trips.start_time`) is stored in UTC. Local `date` columns (like `visits.start_date`) do not have timezones.
* **Standard:** When comparing a specific trip time to a visit date, ALWAYS convert the UTC timestamp to the local YYYY-MM-DD string using JavaScript's `new Date(utcString)` before querying Supabase. Do not rely on SQL string truncation (`substring(0, 10)`), as afternoon trips will roll over into the wrong day in UTC.

## 6. The "Soft Link" Database Pattern
* For simple, bounded lists (like Equipment Sizes: XS, S, M, L, XL), we use a "Soft Link" pattern.
* Instead of creating highly normalized junction tables for every gear size, we store the allowed sizes as a `text[]` array in `equipment_categories`. 
* The `trip_clients` table stores the assigned size as standard `text` (e.g., "XL"). The React UI acts as the strict enforcer, populating dropdowns directly from the `equipment_categories` array to prevent invalid data entry.