import Image from "next/image";

type BrandLogoProps = {
  variant?: "full" | "mark";
  theme?: "light" | "dark";
  size?: number;
  className?: string;
};

/** Logo corporativo centralizado. Los PNG proceden del original oficial.
 *
 * Usa next/image (no <img>) para evitar el salto de layout (CLS) que
 * detectó la auditoría de UX: se pinta en todas las páginas, así que su
 * dimensionado es especialmente sensible. `priority` porque siempre está
 * por encima del pliegue (cabecera/sidebar/login).
 */
export function BrandLogo({
  variant = "mark",
  theme = "light",
  size = 40,
  className,
}: BrandLogoProps) {
  const src = variant === "full"
    ? "/brand/logo-full.png"
    : `/brand/logo-mark-${theme}.png`;
  const height = variant === "full" ? Math.round(size * 0.79) : size;

  return (
    <Image
      src={src}
      alt="Tools4Milk"
      width={size}
      height={height}
      priority
      className={className}
      style={variant === "mark" ? { objectFit: "contain" } : undefined}
    />
  );
}
