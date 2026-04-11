export interface Client {
  id: string;
  name: string;
  email?: string;
}

export interface VisitMemberSelection {
  clientId: string;
  balanceDue: number;
}

export interface VisitSelection {
  visitId: string;
  invoiceId: string | null;
  balance: number;
  members: VisitMemberSelection[];
}

export const PAYMENT_METHODS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Cash'] as const;
