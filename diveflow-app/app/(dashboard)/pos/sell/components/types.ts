export interface CartItem {
  id: string;
  name: string;
  price: number;
  priceStr?: string;
  qty: number;
}

export interface Client {
  id: string;
  name: string;
}

export interface ClientVisit {
  id: string;
  startDate: string; // ISO date string e.g. "2026-04-10"
  endDate: string;
  label: string;     // human-readable e.g. "Apr 10 – Apr 14"
}
