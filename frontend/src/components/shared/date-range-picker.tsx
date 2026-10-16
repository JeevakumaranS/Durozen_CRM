"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DateRangePickerProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const formatDate = (value: string) =>
  parseDateKey(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const firstDay = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const calendarStart = new Date(
      firstDay.getFullYear(),
      firstDay.getMonth(),
      1 - firstDay.getDay(),
    );
    return Array.from(
      { length: 42 },
      (_, index) => new Date(calendarStart.getTime() + index * DAY_MS),
    );
  }, [visibleMonth]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  function selectDate(selected: string) {
    if (!from || to || selected < from) {
      onChange(selected, "");
      return;
    }
    onChange(from, selected);
    setOpen(false);
  }

  const rangeLabel =
    from && to
      ? `${formatDate(from)} – ${formatDate(to)}`
      : from
        ? `${formatDate(from)} – Select end date`
        : "Select date range";

  return (
    <div className="date-range-picker" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="date-range-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {rangeLabel}
      </button>
      {open && (
        <div aria-label="Select date range" className="date-range-calendar" role="dialog">
          <div className="date-range-calendar-header">
            <button
              aria-label="Previous month"
              onClick={() =>
                setVisibleMonth(
                  (current) =>
                    new Date(
                      current.getFullYear(),
                      current.getMonth() - 1,
                      1,
                    ),
                )
              }
              type="button"
            >
              ‹
            </button>
            <strong>
              {visibleMonth.toLocaleDateString("en", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button
              aria-label="Next month"
              onClick={() =>
                setVisibleMonth(
                  (current) =>
                    new Date(
                      current.getFullYear(),
                      current.getMonth() + 1,
                      1,
                    ),
                )
              }
              type="button"
            >
              ›
            </button>
          </div>
          <div className="date-range-calendar-grid">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span className="date-range-weekday" key={day}>
                {day}
              </span>
            ))}
            {days.map((date) => {
              const key = dateKey(date);
              const inMonth =
                date.getMonth() === visibleMonth.getMonth() &&
                date.getFullYear() === visibleMonth.getFullYear();
              const inRange = from && to && key >= from && key <= to;
              return (
                <button
                  aria-label={date.toLocaleDateString("en", {
                    dateStyle: "full",
                  })}
                  aria-pressed={key === from || key === to}
                  className={[
                    "date-range-day",
                    !inMonth ? "outside-month" : "",
                    inRange ? "in-range" : "",
                    key === from || key === to ? "range-edge" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={key}
                  onClick={() => selectDate(key)}
                  type="button"
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="date-range-calendar-footer">
            <span>{from && !to ? "Choose an end date" : rangeLabel}</span>
            {(from || to) && (
              <button
                onClick={() => {
                  onChange("", "");
                  setOpen(false);
                }}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
