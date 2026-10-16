import type { Metadata } from "next";
import { ToastViewport } from "../components/shared/toast-viewport";
import "./globals.css";

export const metadata: Metadata = {
  title: "Durozen CRM",
  description: "Sales Lead & BDE Management",
  icons: {
    icon: {
      url: "/images/durozen-favicon.png?v=2",
      type: "image/png",
      sizes: "128x128",
    },
  },
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
