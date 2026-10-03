import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import jsQR from "jsqr";
import { useI18n } from "../../i18n/context";

interface QrScannerProps {
  active: boolean;
  onScan: (value: string) => void;
}

type CameraStatus =
  | "idle"
  | "starting"
  | "running"
  | "denied"
  | "insecure"
  | "unavailable"
  | "error";

const errorActionButtonStyle: CSSProperties = {
  padding: "8px 24px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.35)",
  backgroundColor: "rgba(255,255,255,0.12)",
  color: "#fff",
  fontFamily: "'Sora', sans-serif",
  fontSize: 14,
  cursor: "pointer",
};

function decodeQrFrame(source: CanvasImageSource, width: number, height: number): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const code = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
  return code?.data || null;
}

export function QrScanner({ active, onScan }: QrScannerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<string>("");
  const lastScanAtRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [processingPhoto, setProcessingPhoto] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const fail = useCallback(
    (next: CameraStatus, message: string) => {
      stopCamera();
      setStatus(next);
      setErrorMessage(message);
    },
    [stopCamera],
  );

  const startCamera = useCallback(async () => {
    setErrorMessage("");

    if (typeof window !== "undefined" && !window.isSecureContext) {
      fail("insecure", t.attendanceScanner.cameraRequiresHttps);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      fail("unavailable", t.attendanceScanner.cameraUnavailable);
      return;
    }

    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        fail("error", t.attendanceScanner.cameraUnavailable);
        return;
      }
      video.srcObject = stream;
      video.setAttribute("playsInline", "true");
      video.muted = true;
      await video.play();
      setStatus("running");

      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        if (!streamRef.current || !videoRef.current || !ctx) return;
        const v = videoRef.current;
        if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0 && v.videoHeight > 0) {
          const width = Math.min(v.videoWidth, 640);
          const height = Math.round((v.videoHeight / v.videoWidth) * width);
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(v, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, width, height, {
            inversionAttempts: "dontInvert",
          });
          if (code?.data) {
            const now = Date.now();
            if (
              code.data !== lastScanRef.current ||
              now - lastScanAtRef.current > 1500
            ) {
              lastScanRef.current = code.data;
              lastScanAtRef.current = now;
              onScanRef.current(code.data);
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        fail("denied", t.attendanceScanner.cameraDenied);
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        fail("unavailable", t.attendanceScanner.cameraNotFound);
      } else if (name === "NotReadableError" || name === "AbortError") {
        fail("error", t.attendanceScanner.cameraBusy);
      } else {
        fail("unavailable", t.attendanceScanner.cameraUnavailable);
      }
    }
  }, [fail, t]);

  const handlePhoto = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input.files?.[0];
      if (!file || processingPhoto) return;
      setProcessingPhoto(true);
      setErrorMessage("");
      let source: CanvasImageSource | null = null;
      let objectUrl: string | null = null;
      let width = 0;
      let height = 0;
      try {
        if (typeof createImageBitmap === "function") {
          const orientOptions = { imageOrientation: "from-image" } as unknown as ImageBitmapOptions;
          try {
            const bitmap = await createImageBitmap(file, orientOptions);
            source = bitmap;
            width = bitmap.width;
            height = bitmap.height;
          } catch {
            try {
              const bitmap = await createImageBitmap(file);
              source = bitmap;
              width = bitmap.width;
              height = bitmap.height;
            } catch {
              source = null;
            }
          }
        }
        if (!source) {
          objectUrl = URL.createObjectURL(file);
          const url = objectUrl;
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("image load failed"));
            img.src = url;
          });
          source = img;
          width = img.naturalWidth;
          height = img.naturalHeight;
        }
        if (!width || !height) {
          throw new Error("empty image");
        }

        const longest = Math.max(width, height);
        const targets = Array.from(
          new Set([Math.min(longest, 1600), Math.min(longest, 3200)]),
        );
        let token = "";
        for (const target of targets) {
          const scale = target / longest;
          const w = Math.max(1, Math.round(width * scale));
          const h = Math.max(1, Math.round(height * scale));
          token = decodeQrFrame(source, w, h) ?? "";
          if (token) break;
        }

        if (token) {
          lastScanRef.current = token;
          lastScanAtRef.current = Date.now();
          setErrorMessage(t.attendanceScanner.qrFound);
          onScanRef.current(token);
        } else {
          setErrorMessage(t.attendanceScanner.qrNotDetected);
        }
      } catch {
        setErrorMessage(t.attendanceScanner.photoLoadFailed);
      } finally {
        setProcessingPhoto(false);
        input.value = "";
        if (source && typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
          source.close();
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    },
    [processingPhoto, t],
  );

  useEffect(() => {
    if (active) {
      void startCamera();
    } else {
      stopCamera();
      setStatus("idle");
      setErrorMessage("");
    }
    return () => stopCamera();
  }, [active, startCamera, stopCamera]);

  if (!active) return null;

  const hasError =
    status === "denied" ||
    status === "insecure" ||
    status === "unavailable" ||
    status === "error";

  return (
    <div style={{ position: "relative", width: "100%", borderRadius: 16, overflow: "hidden", backgroundColor: "#0B0D12" }}>
      <video
        ref={videoRef}
        style={{
          width: "100%",
          display: status === "running" ? "block" : "none",
          aspectRatio: "4 / 3",
          objectFit: "cover",
        }}
      />
      {(status === "starting" || status === "running") && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "12%",
            border: "3px solid rgba(65, 105, 161, 0.9)",
            borderRadius: 12,
            pointerEvents: "none",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
          }}
        />
      )}
      {hasError && (
        <div
          style={{
            padding: "32px 20px",
            textAlign: "center",
            color: "#fff",
            fontFamily: "'Manrope', sans-serif",
            minHeight: 240,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <strong style={{ fontFamily: "'Sora', sans-serif", fontSize: 18 }}>
            {processingPhoto
              ? t.attendanceScanner.decodingPhoto
              : errorMessage ||
                (status === "denied"
                  ? t.attendanceScanner.cameraDenied
                  : t.attendanceScanner.cameraUnavailable)}
          </strong>
          <span style={{ opacity: 0.8, fontSize: 14 }}>{t.attendanceScanner.scanHint}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => void handlePhoto(e)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processingPhoto}
              style={errorActionButtonStyle}
            >
              {t.attendanceScanner.photoScan}
            </button>
            {status !== "insecure" && (
              <button
                type="button"
                onClick={() => void startCamera()}
                disabled={processingPhoto}
                style={errorActionButtonStyle}
              >
                {t.attendanceScanner.retry}
              </button>
            )}
          </div>
        </div>
      )}
      {status === "starting" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontFamily: "'Manrope', sans-serif",
          }}
        >
          {t.attendanceScanner.startingCamera}
        </div>
      )}
    </div>
  );
}

export default QrScanner;
