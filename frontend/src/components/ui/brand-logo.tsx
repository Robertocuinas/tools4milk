type BrandLogoProps = {
  variant?: "full" | "mark";
  theme?: "light" | "dark";
  size?: number;
  className?: string;
};

/** Logo corporativo centralizado. Los PNG proceden del original oficial. */
export function BrandLogo({
  variant = "mark",
  theme = "light",
  size = 40,
  className,
}: BrandLogoProps) {
  const src = variant === "full"
    ? "/brand/logo-full.png"
    : `/brand/logo-mark-${theme}.png`;

  return (
    <img
      src={src}
      alt="Tools4Milk"
      width={variant === "full" ? size : size}
      height={variant === "full" ? Math.round(size * 0.79) : size}
      className={className}
      style={variant === "full"
        ? { width: size, height: "auto" }
        : { width: size, height: size, objectFit: "contain" }}
    />
  );
}
