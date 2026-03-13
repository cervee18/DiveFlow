# DiveFlow UI Patterns & Design System

This document outlines the standard UI guidelines for DiveFlow to ensure a consistent, modern SaaS aesthetic across all pages. 

## 1. Global Theming
* **Mode:** Light mode ONLY. All dark mode variables have been stripped from `globals.css`. Do not use `dark:` Tailwind classes.
* **Global Background:** `bg-slate-50` (Provides subtle depth against white cards).
* **Primary Text:** Use `text-slate-800` or `text-slate-700`. Avoid `text-slate-900` or pure black as it is too harsh.
* **Secondary Text:** `text-slate-500` (Used for subtitles, table headers, and helper text).
* **Brand/Action Color:** "Ocean Blue" (`bg-blue-600` for primary buttons, `hover:bg-blue-700`).

## 2. Core Layouts
* **Master-Detail View:** Dashboard pages (like Clients, Inventory) should use a side-by-side layout. 
    * **Left Column:** A searchable list or data table.
    * **Right Column:** The detailed profile/edit screen for the selected item.
    * **Rule:** Do not bounce users to separate URLs (e.g., `/clients/[id]`) for basic viewing and editing. Keep them on the main dashboard page.
* **Cards:** Main content blocks should use `bg-white rounded-xl shadow-sm border border-slate-200`.

## 3. Modals over Pages
* Creating new records (e.g., "Add New Client", "Add Visit") should be done via a centered popup modal, not a dedicated page.
* **Modal Wrapper:** Use a backdrop blur: `fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4`.

## 4. Chips & Badges
* Use small, rounded chips for statuses or certifications.
* **Neutral Chip:** `bg-slate-100 text-slate-500 border-slate-200`
* **Success/Active Chip:** `bg-emerald-50 text-emerald-600 border-emerald-200`
* **Warning/Alert Chip:** `bg-amber-50 text-amber-600 border-amber-200`