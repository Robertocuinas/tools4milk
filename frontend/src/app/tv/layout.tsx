import { TvFullscreenGuard } from "@/components/tv/TvFullscreenGuard";

/** Layout del modo TV: fuera de (app), sin sidebar ni cabecera de gestion. */
export default function TvLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TvFullscreenGuard />
      {children}
    </>
  );
}
