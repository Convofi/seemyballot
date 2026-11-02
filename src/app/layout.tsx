import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sofia } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Wordmark only. The same face renders the favicon and share image (see icon.tsx).
const sofia = Sofia({
  variable: "--font-sofia",
  weight: "400",
  subsets: ["latin"],
});

const title = "See My Ballot — See exactly what's on your ballot";
const description =
  "Type your address to see every race and measure on your 2026 ballot, where to vote, and what each choice means, with a source for every fact.";

export const metadata: Metadata = {
  metadataBase: new URL("https://seemyballot.com"),
  title,
  description,
  openGraph: { title, description, type: "website", siteName: "See My Ballot" },
};

// Matches --paper in globals.css so the phone's browser chrome blends in.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1a19" },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "See My Ballot",
  url: "https://seemyballot.com",
  description,
  publisher: { "@type": "Organization", name: "ConvoFi", url: "https://convofi.com" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sofia.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        {children}
      </body>
    </html>
  );
}
