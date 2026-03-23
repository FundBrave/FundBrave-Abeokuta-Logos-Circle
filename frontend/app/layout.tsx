import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Abeokuta Logos Circle — Empowering Women Entrepreneurs",
  description:
    "Support 20–30 women entrepreneurs in Abeokuta, Nigeria with access to online education in digital skills, business development, and tech fundamentals.",
  openGraph: {
    title: "Abeokuta Logos Circle — Empowering Women Entrepreneurs",
    description:
      "Raise $1,000–$2,500 to fund online courses on Coursera, Udemy, and AltSchool Africa for women entrepreneurs in Abeokuta, Nigeria.",
    type: "website",
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
