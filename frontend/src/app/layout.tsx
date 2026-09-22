import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

export const metadata: Metadata = {
  title: "Tools4 Milk",
  description: "Frontend operativo para explotaciones lecheras conectadas por zona.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* T6: Space Grotesk/DM Sans no cubren arabe. Se sirve solo cuando
            hay texto arabe en pantalla (idioma ar activo) — Google Fonts
            particiona el WOFF2 por rango unicode, asi que este <link>
            presente para todos los idiomas no descarga peso extra salvo
            que el navegador encuentre glifos arabes que pintar. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
