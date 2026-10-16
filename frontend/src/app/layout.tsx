import type { Metadata } from "next";
import { ToastViewport } from "../components/shared/toast-viewport";
import "./globals.css";

export const metadata: Metadata = {
  title: "Durozen CRM",
  description: "Sales Lead & BDE Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
