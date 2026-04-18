import type { Metadata } from "next";
import { Fraunces, Inter, Geist_Mono } from "next/font/google";
import { SiteGuards } from "@/components/site-guards";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

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
      <body
        className={`${inter.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
      >
        <SiteGuards />
        {children}
      </body>
    </html>
  );
}
