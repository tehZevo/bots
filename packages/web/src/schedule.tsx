import { useEffect, useState } from "react";

export type ScheduleMode =
  | "every"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "custom";

type IntervalUnit = "minutes" | "hours" | "days";

export interface ScheduleState {
  mode: ScheduleMode;
  every: number;
  intervalUnit: IntervalUnit;
  time: string;
  weekdays: number[];
  dayOfMonth: number;
  custom: string;
}

interface ScheduleDescription {
  text: string;
  muted: boolean;
}

const WEEKDAYS = [
  { label: "Sunday", short: "Sun", value: 0 },
  { label: "Monday", short: "Mon", value: 1 },
  { label: "Tuesday", short: "Tue", value: 2 },
  { label: "Wednesday", short: "Wed", value: 3 },
  { label: "Thursday", short: "Thu", value: 4 },
  { label: "Friday", short: "Fri", value: 5 },
  { label: "Saturday", short: "Sat", value: 6 },
];

const UNIT_CODES: Record<IntervalUnit, string> = {
  minutes: "m",
  hours: "h",
  days: "d",
};

function defaultState(
  mode: ScheduleMode = "daily",
  custom = "",
): ScheduleState {
  return {
    mode,
    every: 1,
    intervalUnit: "minutes",
    time: "00:00",
    weekdays: [1],
    dayOfMonth: 1,
    custom,
  };
}

function numericField(
  value: string | undefined,
  min: number,
  max: number,
): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

function timeFromCron(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function weekdayList(value: string | undefined): number[] | null {
  if (!value || !/^\d+(?:,\d+)*$/.test(value)) return null;
  const days = [...new Set(value.split(",").map(Number))];
  if (days.length === 0 || days.some((day) => day > 6)) return null;
  return days.sort((a, b) => a - b);
}

export function parseScheduleState(raw: string): ScheduleState {
  const value = raw.trim();
  const interval = /^@every\s+(\d+)\s*([mhd])$/i.exec(value);
  if (interval) {
    const count = Number(interval[1]);
    const unit = interval[2].toLowerCase();
    if (count > 0 && unit !== "s") {
      return {
        ...defaultState("every", raw),
        every: count,
        intervalUnit:
          unit === "m" ? "minutes" : unit === "h" ? "hours" : "days",
      };
    }
  }

  const parts = value.split(/\s+/);
  if (parts.length === 5) {
    const minute = numericField(parts[0], 0, 59);
    const hour = numericField(parts[1], 0, 23);
    if (minute !== null && hour !== null) {
      const time = timeFromCron(hour, minute);
      if (parts[2] === "*" && parts[3] === "*") {
        if (parts[4] === "*") return { ...defaultState("daily", raw), time };
        if (parts[4] === "1-5") {
          return { ...defaultState("weekdays", raw), time };
        }
        const days = weekdayList(parts[4]);
        if (days && days.length < 7) {
          return { ...defaultState("weekly", raw), time, weekdays: days };
        }
      }
      if (/^\d+$/.test(parts[2] ?? "")) {
        const dayOfMonth = numericField(parts[2], 1, 31);
        if (dayOfMonth !== null && parts[3] === "*" && parts[4] === "*") {
          return { ...defaultState("monthly", raw), time, dayOfMonth };
        }
      }
    }
  }

  return defaultState("custom", raw);
}

export function scheduleFromState(state: ScheduleState): string {
  const [hourPart, minutePart] = state.time.split(":");
  const hour = numericField(hourPart, 0, 23) ?? 0;
  const minute = numericField(minutePart, 0, 59) ?? 0;

  switch (state.mode) {
    case "every":
      return `@every ${Math.max(1, state.every)}${UNIT_CODES[state.intervalUnit]}`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly": {
      const days = state.weekdays.length ? state.weekdays : [0];
      return `${minute} ${hour} * * ${[...days].sort((a, b) => a - b).join(",")}`;
    }
    case "monthly":
      return `${minute} ${hour} ${Math.min(31, Math.max(1, state.dayOfMonth))} * *`;
    case "custom":
      return state.custom.trim();
  }
}

function pluralInterval(count: number, unit: string): string {
  return count === 1 ? `${count} ${unit}` : `${count} ${unit}s`;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function ordinal(day: number): string {
  const teens = day % 100;
  if (teens >= 11 && teens <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function describeCustom(raw: string): ScheduleDescription | null {
  const value = raw.trim();
  if (!value) return null;
  const interval = /^@every\s+(\d+)\s*([smhd])$/i.exec(value);
  if (interval && Number(interval[1]) > 0) {
    const units: Record<string, string> = {
      s: "second",
      m: "minute",
      h: "hour",
      d: "day",
    };
    return {
      text: `Runs every ${pluralInterval(
        Number(interval[1]),
        units[interval[2].toLowerCase()],
      )}`,
      muted: false,
    };
  }

  const parts = value.split(/\s+/);
  if (parts.length === 5 && parts[2] === "*" && parts[3] === "*") {
    if (parts[0]?.startsWith("*/") && parts[1] === "*" && parts[4] === "*") {
      const count = numericField(parts[0].slice(2), 1, Number.MAX_SAFE_INTEGER);
      if (count && count > 0) {
        return {
          text: `Runs every ${pluralInterval(count, "minute")}`,
          muted: false,
        };
      }
    }
  }

  return null;
}

export function describeSchedule(state: ScheduleState): ScheduleDescription {
  const [hourPart, minutePart] = state.time.split(":");
  const hour = numericField(hourPart, 0, 23) ?? 0;
  const minute = numericField(minutePart, 0, 59) ?? 0;
  const time = timeFromCron(hour, minute);

  switch (state.mode) {
    case "every":
      return {
        text: `Runs every ${pluralInterval(
          Math.max(1, state.every),
          state.intervalUnit.slice(0, -1),
        )}`,
        muted: false,
      };
    case "daily":
      return { text: `Runs every day at ${time}`, muted: false };
    case "weekdays":
      return { text: `Runs on weekdays at ${time}`, muted: false };
    case "weekly": {
      const selected = state.weekdays.length ? state.weekdays : [0];
      const names = WEEKDAYS.filter((day) => selected.includes(day.value)).map(
        (day) => day.label,
      );
      return { text: `Runs on ${formatList(names)} at ${time}`, muted: false };
    }
    case "monthly":
      return {
        text: `Runs monthly on the ${ordinal(
          Math.min(31, Math.max(1, state.dayOfMonth)),
        )} at ${time}`,
        muted: false,
      };
    case "custom":
      return (
        describeCustom(state.custom) ?? {
          text: "Custom schedule",
          muted: true,
        }
      );
  }
}

interface PreviewResponse {
  valid?: unknown;
  next?: unknown;
}

async function requestSchedulePreview(
  schedule: string,
): Promise<{ valid: boolean; next: string[] }> {
  const response = await fetch("/api/schedule/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schedule }),
  });
  if (!response.ok) throw new Error(`preview failed (${response.status})`);
  const body = (await response.json()) as PreviewResponse;
  return {
    valid: body.valid === true,
    next: Array.isArray(body.next) ? body.next.map(String) : [],
  };
}

interface PreviewState {
  loading: boolean;
  error: string | null;
  next: string[];
}

export function ScheduleEditor({
  value,
  onChange,
  debounceMs = 300,
}: {
  value: string;
  onChange: (schedule: string) => void;
  debounceMs?: number;
}) {
  const [state, setState] = useState<ScheduleState>(() =>
    parseScheduleState(value),
  );
  const [preview, setPreview] = useState<PreviewState>({
    loading: true,
    error: null,
    next: [],
  });

  const expression = scheduleFromState(state);
  const description = describeSchedule(state);

  useEffect(() => {
    if (!expression) {
      setPreview({ loading: false, error: "Enter a schedule.", next: [] });
      return;
    }
    let active = true;
    setPreview((current) => ({ ...current, loading: true }));
    const timer = setTimeout(() => {
      void requestSchedulePreview(expression).then(
        (result) => {
          if (!active) return;
          setPreview({
            loading: false,
            error: result.valid ? null : "Invalid schedule expression.",
            next: result.next.slice(0, 5),
          });
        },
        () => {
          if (active) {
            setPreview({
              loading: false,
              error: "Could not preview this schedule.",
              next: [],
            });
          }
        },
      );
    }, debounceMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [debounceMs, expression]);

  const update = (patch: Partial<ScheduleState>) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange(scheduleFromState(next));
  };

  const changeMode = (mode: ScheduleMode) => {
    const next: ScheduleState = { ...state, mode };
    if (mode === "custom") next.custom = scheduleFromState(state);
    setState(next);
    onChange(scheduleFromState(next));
  };

  return (
    <div className="schedule-editor">
      <p className={description.muted ? "muted" : "schedule-sentence"}>
        {description.text}
      </p>
      <label className="field">
        Schedule
        <select
          aria-label="Schedule type"
          value={state.mode}
          onChange={(event) => changeMode(event.target.value as ScheduleMode)}
        >
          <option value="every">Every</option>
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      {state.mode === "every" && (
        <div className="schedule-controls">
          <label className="field schedule-number">
            Amount
            <input
              aria-label="Repeat interval amount"
              type="number"
              min={1}
              step={1}
              value={state.every}
              onChange={(event) =>
                update({ every: Math.max(1, Number(event.target.value) || 1) })
              }
            />
          </label>
          <label className="field">
            Unit
            <select
              aria-label="Interval unit"
              value={state.intervalUnit}
              onChange={(event) =>
                update({ intervalUnit: event.target.value as IntervalUnit })
              }
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </label>
        </div>
      )}

      {(state.mode === "daily" ||
        state.mode === "weekdays" ||
        state.mode === "weekly" ||
        state.mode === "monthly") && (
        <div className="schedule-controls">
          {state.mode === "weekly" && (
            <fieldset className="schedule-days">
              <legend>Days</legend>
              {WEEKDAYS.map((day) => (
                <label key={day.value}>
                  <input
                    type="checkbox"
                    checked={state.weekdays.includes(day.value)}
                    onChange={() => {
                      const has = state.weekdays.includes(day.value);
                      if (!has) {
                        update({
                          weekdays: [...state.weekdays, day.value].sort(
                            (a, b) => a - b,
                          ),
                        });
                      } else if (state.weekdays.length > 1) {
                        update({
                          weekdays: state.weekdays.filter(
                            (x) => x !== day.value,
                          ),
                        });
                      }
                    }}
                  />
                  <span>{day.short}</span>
                </label>
              ))}
            </fieldset>
          )}
          {state.mode === "monthly" && (
            <label className="field schedule-number">
              Day of month
              <input
                aria-label="Day of month"
                type="number"
                min={1}
                max={31}
                value={state.dayOfMonth}
                onChange={(event) => {
                  const day = Number(event.target.value);
                  update({
                    dayOfMonth: Math.min(31, Math.max(1, day || 1)),
                  });
                }}
              />
            </label>
          )}
          <label className="field">
            Time
            <input
              aria-label="Run time"
              type="time"
              value={state.time}
              onChange={(event) => {
                const time = /^\d{2}:\d{2}$/.test(event.target.value)
                  ? event.target.value
                  : state.time;
                update({ time });
              }}
            />
          </label>
        </div>
      )}

      {state.mode === "custom" && (
        <input
          aria-label="Custom schedule expression"
          placeholder="cron or @every 30m"
          value={state.custom}
          onChange={(event) => {
            setState({ ...state, custom: event.target.value });
            onChange(event.target.value.trim());
          }}
        />
      )}

      <div className="schedule-preview" aria-live="polite">
        <span className="muted">Next fires</span>
        {preview.loading ? (
          <p className="muted">Checking…</p>
        ) : preview.error ? (
          <p className="schedule-error">{preview.error}</p>
        ) : (
          <ul>
            {preview.next.map((occurrence) => (
              <li key={occurrence}>
                {new Date(occurrence).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
