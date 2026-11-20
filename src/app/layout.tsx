import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { EditModeUrlWatcher } from "@/components/EditMode";
import { fallbackFontVariables } from "./fonts";

export const metadata: Metadata = {
  title: "Kingshot Alliance Management",
  description: "Kingshot Alliance Management Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fallbackFontVariables}>
      <body>
        <EditModeUrlWatcher />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
