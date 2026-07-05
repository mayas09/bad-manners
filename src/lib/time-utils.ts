export const SITE_TIME_ZONE = "America/New_York";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const dateTimePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SITE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function getSiteDateParts(date: Date): DateParts {
  const parts = dateTimePartsFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function getTimeZoneOffsetMs(date: Date) {
  const parts = getSiteDateParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

export function formatInSiteTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
) {
  return new Date(value).toLocaleString([], { ...options, timeZone: SITE_TIME_ZONE });
}

export function formatDateInSiteTime(value: string | number | Date) {
  return formatInSiteTime(value, { dateStyle: "medium" });
}

export function formatPlainDateInSiteTime(value: string) {
  return formatInSiteTime(`${value}T12:00:00Z`, { dateStyle: "medium" });
}

export function getSiteTodayInputValue() {
  const parts = getSiteDateParts(new Date());
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getSiteDayOfWeek() {
  const parts = getSiteDateParts(new Date());
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function siteDateTimeToUtcIso(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number },
) {
  const utcGuess = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess)));
  const secondPass = new Date(utcGuess - getTimeZoneOffsetMs(firstPass));
  return secondPass.toISOString();
}
