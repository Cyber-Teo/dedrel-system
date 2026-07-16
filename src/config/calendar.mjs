/**
 * Календарь мира Дедрел — конфиг для нативного календаря Foundry V14.
 * Подключается в init-хуке: CONFIG.time.worldCalendarConfig = DEDREL_CALENDAR_CONFIG.
 * Схема — foundry.data.CalendarData (см. NOTES.md, раздел «Календарь»).
 *
 * Особенности мира:
 *  - 12 месяцев СТРОГО по 30 дней (год = 360 дней), без високосных лет;
 *  - названия месяцев григорианские, чтобы не путать игроков;
 *  - yearZero = 1005: свежий мир (worldTime = 0) начинается в текущем году сеттинга.
 *
 * ВАЖНО: длительности Active Effects с units "days"/"hours" ядро конвертирует
 * в секунды именно через этот календарь (game.time.calendar.componentsToTime).
 */
export const DEDREL_CALENDAR_CONFIG = {
  name: "DEDREL.Calendar.Name",
  description: "DEDREL.Calendar.Description",
  years: {
    yearZero: 1005,
    firstWeekday: 0,
    leapYear: null
  },
  months: {
    values: [
      { name: "DEDREL.Calendar.Months.January", abbreviation: "DEDREL.Calendar.MonthsAbbr.January", ordinal: 1, days: 30 },
      { name: "DEDREL.Calendar.Months.February", abbreviation: "DEDREL.Calendar.MonthsAbbr.February", ordinal: 2, days: 30 },
      { name: "DEDREL.Calendar.Months.March", abbreviation: "DEDREL.Calendar.MonthsAbbr.March", ordinal: 3, days: 30 },
      { name: "DEDREL.Calendar.Months.April", abbreviation: "DEDREL.Calendar.MonthsAbbr.April", ordinal: 4, days: 30 },
      { name: "DEDREL.Calendar.Months.May", abbreviation: "DEDREL.Calendar.MonthsAbbr.May", ordinal: 5, days: 30 },
      { name: "DEDREL.Calendar.Months.June", abbreviation: "DEDREL.Calendar.MonthsAbbr.June", ordinal: 6, days: 30 },
      { name: "DEDREL.Calendar.Months.July", abbreviation: "DEDREL.Calendar.MonthsAbbr.July", ordinal: 7, days: 30 },
      { name: "DEDREL.Calendar.Months.August", abbreviation: "DEDREL.Calendar.MonthsAbbr.August", ordinal: 8, days: 30 },
      { name: "DEDREL.Calendar.Months.September", abbreviation: "DEDREL.Calendar.MonthsAbbr.September", ordinal: 9, days: 30 },
      { name: "DEDREL.Calendar.Months.October", abbreviation: "DEDREL.Calendar.MonthsAbbr.October", ordinal: 10, days: 30 },
      { name: "DEDREL.Calendar.Months.November", abbreviation: "DEDREL.Calendar.MonthsAbbr.November", ordinal: 11, days: 30 },
      { name: "DEDREL.Calendar.Months.December", abbreviation: "DEDREL.Calendar.MonthsAbbr.December", ordinal: 12, days: 30 }
    ]
  },
  days: {
    values: [
      { name: "DEDREL.Calendar.Days.Monday", abbreviation: "DEDREL.Calendar.DaysAbbr.Monday", ordinal: 1 },
      { name: "DEDREL.Calendar.Days.Tuesday", abbreviation: "DEDREL.Calendar.DaysAbbr.Tuesday", ordinal: 2 },
      { name: "DEDREL.Calendar.Days.Wednesday", abbreviation: "DEDREL.Calendar.DaysAbbr.Wednesday", ordinal: 3 },
      { name: "DEDREL.Calendar.Days.Thursday", abbreviation: "DEDREL.Calendar.DaysAbbr.Thursday", ordinal: 4 },
      { name: "DEDREL.Calendar.Days.Friday", abbreviation: "DEDREL.Calendar.DaysAbbr.Friday", ordinal: 5 },
      { name: "DEDREL.Calendar.Days.Saturday", abbreviation: "DEDREL.Calendar.DaysAbbr.Saturday", ordinal: 6, isRestDay: true },
      { name: "DEDREL.Calendar.Days.Sunday", abbreviation: "DEDREL.Calendar.DaysAbbr.Sunday", ordinal: 7, isRestDay: true }
    ],
    daysPerYear: 360,
    hoursPerDay: 24,
    minutesPerHour: 60,
    secondsPerMinute: 60
  },
  seasons: {
    values: [
      { name: "DEDREL.Calendar.Seasons.Spring", monthStart: 3, monthEnd: 5 },
      { name: "DEDREL.Calendar.Seasons.Summer", monthStart: 6, monthEnd: 8 },
      { name: "DEDREL.Calendar.Seasons.Fall", monthStart: 9, monthEnd: 11 },
      { name: "DEDREL.Calendar.Seasons.Winter", monthStart: 12, monthEnd: 2 }
    ]
  }
};
