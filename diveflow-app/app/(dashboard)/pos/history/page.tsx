import { redirect } from 'next/navigation';

export default function POSHistoryRedirect() {
  redirect('/pos/invoices');
}
