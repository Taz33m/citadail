import type { Metadata } from "next";
import { SiteGuards } from "@/components/site-guards";
import "./globals.css";

export const metadata: Metadata = {
  title: "Citadail",
  description:
    "AI-native equity coverage workspace with tools, sessions, and artifacts.",
  icons: {
    icon: [
      { url: "/favicon.ico?v=3", type: "image/x-icon" },
      { url: "/favicon.png?v=3", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico?v=3", type: "image/x-icon" }],
    apple: [{ url: "/favicon.png?v=3", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SiteGuards />
        {children}
      </body>
    </html>
  );
}
