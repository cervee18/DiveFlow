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