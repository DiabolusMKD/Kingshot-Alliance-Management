import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
