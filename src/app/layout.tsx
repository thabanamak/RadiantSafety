import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RadiantSafety — Melbourne Live Safety Map",
  description:
    "Real-time community-driven safety heatmap for Melbourne. See live threats, report incidents, and navigate with collective intelligence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-radiant-dark text-gray-200 antialiased">
        {children}
      </body>
    </html>
  );
}
