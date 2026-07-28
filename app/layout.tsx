import type { Metadata } from "next";
import { Inter, Lora, Geist_Mono } from "next/font/google";
import GraypassMonitor from "@/components/GraypassMonitor";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Top 100 Indies — the indie hacker leaderboard for X",
  description:
    "Ranking the top indie tech founders on X by who's building the loudest.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <GraypassMonitor />
      </body>
    </html>
  );
}
