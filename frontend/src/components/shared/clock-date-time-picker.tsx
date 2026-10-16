"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ClockDateTimePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minValue?: string;
  className?: string;
};

type ClockUnit = "hour" | "minute";
type Meridiem = "AM" | "PM";

const pad = (value: number) => String(value).padStart(2, "0");
const clockValues = Array.from({ length: 12 }, (_, index) => index);

function clockPosition(index: number, radius: number) {
  const { x, y } = clockCoordinates(index, radius);
  return {
    left: `${x}px`,
    top: `${y}px`,
  };
}

function clockCoordinates(index: number, radius: number) {
  const angle = (index * 30 - 90) * (Math.PI / 180);
  return {
    x: 120 + Math.cos(angle) * radius,
    y: 120 + Math.sin(angle) * radius,
  };
}

function displayValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "Select date and time";
  const [, year, month, day, hour, minute] = match;
  const hourValue = Number(hour);
  const meridiem = hourValue >= 12 ? "PM" : "AM";
  const displayHour = hourValue % 12 || 12;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
  return `${dateLabel} · ${displayHour}:${minute} ${meridiem}`;
}

function currentDraft(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match) {
    const hour = Number(match[2]);
    return {
      date: match[1],
      hour: hour % 12 || 12,
      minute: Number(match[3]),
      meridiem: (hour >= 12 ? "PM" : "AM") as Meridiem,
    };
  }
  return {
    date: "",
    hour: 12,
    minute: 0,
    meridiem: "AM" as Meridiem,
  };
}

export function ClockDateTimePicker({
  label,
  value,
  onChange,
  required = false,
  minValue,
  className = "",
}: ClockDateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<ClockUnit>("hour");
  const [draft, setDraft] = useState(() => currentDraft(value));
  const [popoverPosition, setPopoverPosition] = useState({ left: 12, top: 12 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const classes = ["clock-date-time-picker", className]
    .filter(Boolean)
    .join(" ");
  const selectedHour = draft.hour % 12;
  const selectedMinute = Math.round(draft.minute / 5) % 12;
  const handIndex = unit === "hour" ? selectedHour : draft.minute / 5;
  const handPosition = clockCoordinates(
    handIndex,
    unit === "hour" ? 72 : 92,
  );
  const draftValue = draft.date
    ? `${draft.date}T${pad((draft.hour % 12) + (draft.meridiem === "PM" ? 12 : 0))}:${pad(draft.minute)}`
    : "";
  const belowMinimum = Boolean(minValue && draftValue && draftValue < minValue);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const bounds = trigger.getBoundingClientRect();
      const margin = 12;
      const popoverWidth = Math.min(
        popover.offsetWidth,
        window.innerWidth - margin * 2,
      );
      const popoverHeight = Math.min(
        popover.offsetHeight,
        window.innerHeight - margin * 2,
      );
      const left = Math.min(
        Math.max(margin, bounds.left),
        window.innerWidth - popoverWidth - margin,
      );
      const belowTop = bounds.bottom + 7;
      const top =
        belowTop + popoverHeight <= window.innerHeight - margin
          ? belowTop
          : Math.max(margin, bounds.top - popoverHeight - 7);
      setPopoverPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function openPicker() {
    setDraft(currentDraft(value));
    setUnit("hour");
    setOpen(true);
  }

  function save() {
    if (!draft.date || belowMinimum) return;
    onChange(draftValue);
    setOpen(false);
  }

  return (
    <div className={classes}>
      <span className="clock-date-time-label">
        {label}
        {required ? " *" : ""}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="clock-date-time-trigger"
        aria-label={`${label}: ${displayValue(value)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
      >
        <span>{displayValue(value)}</span>
        <span className="clock-date-time-trigger-icon" aria-hidden="true">
          ◷
        </span>
      </button>
      {open && (
        createPortal(
          <div
            ref={popoverRef}
            className="clock-date-time-popover"
            style={{ left: popoverPosition.left, top: popoverPosition.top }}
            role="dialog"
            aria-label={`${label} picker`}
          >
          <div className="clock-date-time-popover-heading">
            <strong>{label}</strong>
            <button
              type="button"
              aria-label="Close date and time picker"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <label className="clock-date-time-date">
            Date
            <input
              type="date"
              required={required}
              min={minValue?.slice(0, 10) || undefined}
              value={draft.date}
              onChange={(event) =>
                setDraft((current) => ({ ...current, date: event.target.value }))
              }
            />
          </label>
          <div className="analog-time-picker">
            <p className="analog-time-picker-title">Select time</p>
            <div className="analog-time-picker-content">
              <div className="analog-time-picker-selection">
                <div className="analog-time-picker-readout">
                  <button
                    type="button"
                    className={unit === "hour" ? "selected" : ""}
                    aria-label="Choose hour"
                    onClick={() => setUnit("hour")}
                  >
                    {draft.hour}
                  </button>
                  <span>:</span>
                  <button
                    type="button"
                    className={unit === "minute" ? "selected" : ""}
                    aria-label="Choose minute"
                    onClick={() => setUnit("minute")}
                  >
                    {pad(draft.minute)}
                  </button>
                </div>
                <div className="analog-time-picker-meridiem">
                  {(["AM", "PM"] as const).map((meridiem) => (
                    <button
                      type="button"
                      key={meridiem}
                      className={draft.meridiem === meridiem ? "selected" : ""}
                      aria-pressed={draft.meridiem === meridiem}
                      onClick={() =>
                        setDraft((current) => ({ ...current, meridiem }))
                      }
                    >
                      {meridiem}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="analog-time-picker-dial"
                role="group"
                aria-label={`Select ${unit}`}
                tabIndex={unit === "minute" ? 0 : -1}
                onClick={(event) => {
                  if (unit !== "minute") return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const x = event.clientX - (bounds.left + bounds.width / 2);
                  const y = event.clientY - (bounds.top + bounds.height / 2);
                  if (Math.hypot(x, y) < 28) return;
                  const angle =
                    (Math.atan2(y, x) * (180 / Math.PI) + 450) % 360;
                  setDraft((current) => ({
                    ...current,
                    minute: Math.round(angle / 6) % 60,
                  }));
                }}
                onKeyDown={(event) => {
                  if (unit !== "minute") return;
                  const change =
                    event.key === "ArrowRight" || event.key === "ArrowUp"
                      ? 1
                      : event.key === "ArrowLeft" || event.key === "ArrowDown"
                        ? -1
                        : 0;
                  if (!change) return;
                  event.preventDefault();
                  setDraft((current) => ({
                    ...current,
                    minute: (current.minute + change + 60) % 60,
                  }));
                }}
              >
                <svg
                  className="analog-time-picker-hands"
                  viewBox="0 0 240 240"
                  aria-hidden="true"
                >
                  <line
                    x1="120"
                    y1="120"
                    x2={handPosition.x}
                    y2={handPosition.y}
                  />
                </svg>
                {clockValues.map((index) => {
                  const valueOnDial =
                    unit === "hour"
                      ? index === 0
                        ? 12
                        : index
                      : index * 5;
                  const isSelected =
                    unit === "hour"
                      ? draft.hour === valueOnDial
                      : selectedMinute === index;
                  return (
                    <button
                      type="button"
                      key={index}
                      className={`analog-time-picker-number${isSelected ? " selected" : ""}`}
                      style={clockPosition(index, unit === "hour" ? 72 : 92)}
                      aria-pressed={isSelected}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (unit === "hour") {
                          setDraft((current) => ({
                            ...current,
                            hour: valueOnDial,
                          }));
                          setUnit("minute");
                        } else {
                          setDraft((current) => ({
                            ...current,
                            minute: valueOnDial,
                          }));
                        }
                      }}
                    >
                      {unit === "minute" ? pad(valueOnDial) : valueOnDial}
                    </button>
                  );
                })}
                <span className="analog-time-picker-center" />
              </div>
            </div>
          </div>
          {belowMinimum && (
            <p className="clock-date-time-error" role="alert">
              Choose a time on or after the minimum allowed date and time.
            </p>
          )}
          <div className="clock-date-time-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="confirm"
              disabled={!draft.date || belowMinimum}
              onClick={save}
            >
              OK
            </button>
          </div>
          </div>,
          document.body,
        )
      )}
    </div>
  );
}
