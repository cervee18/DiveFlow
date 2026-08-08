'use client';

import { useRouter } from 'next/navigation';

export default function DatePicker({ value }: { value: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      value={value}
      onChange={e => {
        if (e.target.value) router.push(`/book?date=${e.target.value}`);
      }}
      className="text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
    />
  );
}
