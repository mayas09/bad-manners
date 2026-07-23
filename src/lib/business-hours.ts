import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSiteDateParts, siteDateTimeToUtcIso } from "@/lib/time-utils";

export type BusinessDay = {
  day_of_week: number;
  open_time: string; // "HH:MM:SS"
  close_time: string;
  is_closed: boolean;
};

const FALLBACK: BusinessDay[] = [
  { day_of_week: 0, open_time: "08:30:00", close_time: "15:00:00", is_closed: false },
  { day_of_week: 1, open_time: "08:00:00", close_time: "15:00:00", is_closed: false },
  { day_of_week: 2, open_time: "08:00:00", close_time: "15:00:00", is_closed: false },
  { day_of_week: 3, open_time: "08:00:00", close_time: "15:00:00", is_closed: false },
  { day_of_week: 4, open_time: "08:00:00", close_time: "15:00:00", is_closed: false },
  { day_of_week: 5, open_time: "08:00:00", close_time: "15:00:00", is_closed: false },
  { day_of_week: 6, open_time: "08:30:00", close_time: "15:00:00", is_closed: false },
];

function parseTime(s: string): { h: number; min: number } {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  return { h: h || 0, min: m || 0 };
}

export function useBusinessSettings() {
  const [days, setDays] = useState<BusinessDay[]>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("business_settings" as any)
        .select("day_of_week,open_time,close_time,is_closed")
        .order("day_of_week");
      if (cancelled) return;
      if (!error && data && (data as any).length) setDays(data as unknown as BusinessDay[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { days, loaded };
}

/**
 * Generate 15-minute pickup slots between now+15min and today's close time,
 * using the structured business_settings for the current site day-of-week.
 */
export function generatePickupSlotsForToday(days: BusinessDay[]): {
  slots: { value: string; label: string }[];
  closed: boolean;
} {
  const now = new Date();
  const today = getSiteDateParts(now);
  const dow = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const row = days.find((d) => d.day_of_week === dow);
  if (!row || row.is_closed) return { slots: [], closed: true };

  const openT = parseTime(row.open_time);
  const closeT = parseTime(row.close_time);
  const todayDate = { year: today.year, month: today.month, day: today.day };
  const open = new Date(siteDateTimeToUtcIso(todayDate, { hour: openT.h, minute: openT.min }));
  const close = new Date(siteDateTimeToUtcIso(todayDate, { hour: closeT.h, minute: closeT.min }));
  const start = new Date(Math.max(now.getTime() + 15 * 60 * 1000, open.getTime()));
  const rem = start.getMinutes() % 15;
  if (rem) start.setMinutes(start.getMinutes() + (15 - rem), 0, 0);

  const slots: { value: string; label: string }[] = [];
  for (let t = new Date(start); t <= close; t = new Date(t.getTime() + 15 * 60 * 1000)) {
    slots.push({
      value: t.toISOString(),
      label: t.toLocaleString([], { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }),
    });
  }
  return { slots, closed: false };
}
