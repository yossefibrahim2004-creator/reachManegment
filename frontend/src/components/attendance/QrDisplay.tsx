import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrDisplayProps {
  token: string;
  size?: number;
}

export function QrDisplay({ token, size = 320 }: QrDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const displaySize = `min(${size}px, 100%)`;

  useEffect(() => {
    let cancelled = false;
    setError(false);
    if (!token) {
      setDataUrl(null);
      return;
    }
    QRCode.toDataURL(token, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size,
      color: { dark: "#0B0D12", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, size]);

  if (error || !dataUrl) {
    return (
      <div
        style={{
          width: displaySize,
          aspectRatio: "1 / 1",
          borderRadius: 16,
          backgroundColor: "#F5F3F0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#69707D",
          fontFamily: "'Manrope', sans-serif",
          fontSize: 14,
        }}
      >
        …
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Attendance QR"
      width={size}
      height={size}
      style={{
        display: "block",
        width: displaySize,
        height: "auto",
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        backgroundColor: "#fff",
      }}
    />
  );
}

export default QrDisplay;
