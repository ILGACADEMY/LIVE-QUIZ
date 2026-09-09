import type { Metadata } from "next";
import { Fraunces, Manrope, Space_Grotesk, Italiana } from "next/font/google";
import "./globals.css";
import SiteLogo from "@/components/shared/SiteLogo";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"]
});
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-spacegrotesk", weight: ["500", "700"] });
// A distinct, deliberately more "creative"/editorial display face reserved
// for the Meridian wordmark itself — thin elegant caps in the style of
// fashion/perfume branding, so it reads as a standalone mark rather than
// blending into the Fraunces italic used for ordinary headings elsewhere.
const italiana = Italiana({ subsets: ["latin"], variable: "--font-italiana", weight: "400" });

export const metadata: Metadata = {
  title: "Meridian — ILG Academy Live Quiz",
  description: "ILG Academy's live training quiz engine."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable} ${spaceGrotesk.variable} ${italiana.variable}`}>
      <body className="bg-charcoal text-ivory font-body min-h-screen">
        <SiteLogo />
        {children}
      </body>
    </html>
  );
}
