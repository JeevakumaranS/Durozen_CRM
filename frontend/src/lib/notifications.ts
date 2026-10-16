export type NotificationType = "success" | "error";

export type AppNotification = {
  id: number;
  message: string;
  type: NotificationType;
};

export const APP_NOTIFICATION_EVENT = "durozen:notification";

export function notify(
  message: string,
  type: NotificationType = "success",
): void {
  if (typeof window === "undefined" || !message.trim()) return;

  window.dispatchEvent(
    new CustomEvent<AppNotification>(APP_NOTIFICATION_EVENT, {
      detail: {
        id: Date.now() + Math.random(),
        message,
        type,
      },
    }),
  );
}
