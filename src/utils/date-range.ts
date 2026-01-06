export function getDateRange(
  startDate?: string,
  endDate?: string,
): { start: Date; end: Date } {
  const start = startDate ? new Date(startDate) : new Date();
  start.setHours(0, 0, 0, 0);

  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
