import { useState, type CSSProperties } from "react";
import { useSettings } from "../lib/settings";

interface BrandLogoProps {
  size?: number;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}

export default function BrandLogo({
  size = 32,
  radius = 8,
  className,
  style,
}: BrandLogoProps) {
  const { brand } = useSettings();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const failed = failedUrl === brand.logoUrl;
  const initial = brand.businessName.trim().charAt(0).toUpperCase() || "P";

  if (brand.logoUrl && !failed) {
    return (
      <img
        src={brand.logoUrl}
        alt={brand.businessName}
        className={className}
        onError={() => setFailedUrl(brand.logoUrl)}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          borderRadius: radius,
          display: "block",
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: "var(--brand-fill)",
        color: "var(--on-brand)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(11, Math.round(size * 0.4)),
        fontFamily: "Sora, sans-serif",
        flexShrink: 0,
        ...style,
      }}
    >
      {initial}
    </div>
  );
}
