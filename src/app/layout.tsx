import type { Metadata } from "next";
import { Fraunces, Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"]
});
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-spacegrotesk", weight: ["500", "700"] });

export const metadata: Metadata = {
  title: "ILG Academy — Live Quiz",
  description: "ILG Academy's live training quiz engine."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-charcoal text-ivory font-body min-h-screen">{children}</body>
    </html>
  );
}
