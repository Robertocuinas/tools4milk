import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { LANGUAGE_BOOTSTRAP_SCRIPT } from "@/lib/i18n-config";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "Tools4Milk",
    template: "%s | Tools4Milk",
  },
  description: "Frontend operativo para explotaciones lecheras conectadas por zona.",
  applicationName: "Tools4Milk",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Tools4Milk",
    description: "Centro operativo para explotaciones lecheras.",
    images: ["/opengraph-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1DA1F2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script inline cambia lang/dir de <html>
    // antes de hidratar segun el idioma guardado; React no debe revertirlo.
    <html lang="es" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANGUAGE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
