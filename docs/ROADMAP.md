# DiveFlow: Product Roadmap & Terminology

DiveFlow is a modern, web-based dive center management platform designed to track clients, manage hotel visits, schedule boat trips, and monitor inventory.

## 1. Core Terminology
* **Client / Diver:** The person diving. Avoid using the word "Customer".
* **Visit:** A specific timeframe a Client is staying on the island. A single Visit is tied to a specific Hotel and Dates, but can contain multiple linked Clients (companions/couples).
* **Trip:** A scheduled boat dive. A Trip links a specific Boat, Staff Member(s), and multiple Clients.

## 2. Completed Features
* **Auth:** Next.js Server-side authentication via Supabase.
* **Global UI:** Light-theme SaaS layout with sidebar navigation.
* **Client Directory:** * Live-search combobox.
    * Master-Detail side-by-side editing.
    * Lookup tables for Certification Organizations (PADI, SSI) and Levels (OWD, AOWD, Pro levels).
* **Visits Module:** * Ability to log hotel check-in/out dates for clients.
    * Linking multiple companions to the same visit.
    * Smart deletion logic (remove self vs. delete entire trip).

* **Trips / Scheduling Module:** * Daily roster management via a horizontal TopBar timeline.
    * **Interactive Manifest:** Inline editing for gear assignment, waivers, and nitrox percentages with batch-saving functionality.
    * **Visit Validation (Ghost Booking Prevention):** Hard logic that prevents adding a client to a boat if they do not have an active hotel visit overlapping the trip date.
    * **Companion Grouping:** Automated detection of travel companions (via the `visit_clients` table) for 1-click bulk adding/removing from trip manifests.

## 3. Upcoming Modules (To Be Built)
* **Inventory Management:** * Tracking BCDs, regulators, and tanks.
    * Maintenance alerts based on service dates.
    * Assigning specific rental gear to clients on a trip.
* **Staff Management:** * Distinguishing between regular Clients and Staff (using the `is_professional` boolean on cert levels).