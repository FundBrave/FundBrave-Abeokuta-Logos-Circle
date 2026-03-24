import type { Metadata } from "next";
import { Providers } from "./providers";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./globals.css";

// FE-L1: metadataBase is required for absolute OG image URLs
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Abeokuta Logos Circle — Empowering Women Entrepreneurs",
  description:
    "Support 20–30 women entrepreneurs in Abeokuta, Nigeria with access to online education in digital skills, business development, and tech fundamentals.",
  openGraph: {
    title: "Abeokuta Logos Circle — Empowering Women Entrepreneurs",
    description:
      "Raise $1,000–$2,500 to fund online courses on Coursera, Udemy, and AltSchool Africa for women entrepreneurs in Abeokuta, Nigeria.",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Abeokuta Logos Circle" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#09011a] text-white antialiased">
        <ErrorBoundary>
          <Providers>{children}</Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
