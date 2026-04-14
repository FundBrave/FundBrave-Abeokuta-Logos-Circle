import type { Metadata } from "next";
import { Providers } from "./providers";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScrollToTop } from "./components/ScrollToTop";
import "material-symbols/outlined.css";
import "./globals.css";


// FE-L1: metadataBase is required for absolute OG image URLs
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  icons: {
    icon: "/images/logo/Fundbrave_icon-gradient.png",
    apple: "/images/logo/Fundbrave_icon-gradient.png",
  },
  title: "Abeokuta Logos Circle — Empowering Women Entrepreneurs",
  description:
    "Support 20–30 women entrepreneurs in Abeokuta, Nigeria with access to online education in digital skills, business development, and tech fundamentals.",
  openGraph: {
    title: "Abeokuta Logos Circle — Empowering Women Entrepreneurs",
    description:
      "Raise $2,000 to fund online courses on Coursera, Udemy, and AltSchool Africa for women entrepreneurs in Abeokuta, Nigeria.",
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap"
        />
      </head>
      <body className="min-h-screen bg-[#0A0E1A] text-[#dfe2f3] antialiased font-body" suppressHydrationWarning>
        <ScrollToTop />
        <ErrorBoundary>
          <Providers>{children}</Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
