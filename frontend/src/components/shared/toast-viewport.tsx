"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_NOTIFICATION_EVENT,
  AppNotification,
} from "../../lib/notifications";

type VisibleNotification = AppNotification & { leaving: boolean };
type NotificationTimers = {
  dismiss: ReturnType<typeof setTimeout>;
  remove?: ReturnType<typeof setTimeout>;
};

export function ToastViewport() {
  const [notifications, setNotifications] = useState<VisibleNotification[]>([]);
  const timers = useRef(new Map<number, NotificationTimers>());

  const dismiss = useCallback((id: number) => {
    const currentTimers = timers.current.get(id);
    if (!currentTimers || currentTimers.remove) return;
    clearTimeout(currentTimers.dismiss);
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, leaving: true } : item,
      ),
    );
    currentTimers.remove = setTimeout(() => {
      setNotifications((current) => current.filter((item) => item.id !== id));
      timers.current.delete(id);
    }, 220);
  }, []);

  useEffect(() => {
    function receive(event: Event) {
      const notification = (event as CustomEvent<AppNotification>).detail;
      if (
        !notification ||
        typeof notification.message !== "string" ||
        (notification.type !== "success" && notification.type !== "error")
      ) {
        return;
      }
      setNotifications((current) => [
        ...current,
        { ...notification, leaving: false },
      ]);
      const dismissTimer = setTimeout(() => dismiss(notification.id), 3000);
      timers.current.set(notification.id, { dismiss: dismissTimer });
    }

    window.addEventListener(APP_NOTIFICATION_EVENT, receive);
    return () => {
      window.removeEventListener(APP_NOTIFICATION_EVENT, receive);
      timers.current.forEach(({ dismiss: dismissTimer, remove }) => {
        clearTimeout(dismissTimer);
        if (remove) clearTimeout(remove);
      });
      timers.current.clear();
    };
  }, [dismiss]);

  return (
    <div className="toast-viewport" aria-label="Notifications">
      {notifications.map((notification) => (
        <div
          className={`app-toast app-toast-${notification.type}${notification.leaving ? " app-toast-leaving" : ""}`}
          key={notification.id}
          role={notification.type === "error" ? "alert" : "status"}
        >
          <span className="app-toast-message">{notification.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(notification.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
