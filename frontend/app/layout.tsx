import type { Metadata } from "next";
import { Playfair_Display, Dancing_Script, DM_Sans } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dancing = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Diary",
  description: "Your private space to write and share feelings",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${dancing.variable} ${dmSans.variable}`}>
      <body className="font-sans antialiased bg-paper text-ink min-h-screen">
        {children}
      </body>
    </html>
  );
}
