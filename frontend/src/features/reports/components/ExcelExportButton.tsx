import { useState } from "react";
import ExcelJS from "exceljs";
import { useSettings } from "../../../lib/settings";

interface ExcelExportButtonProps<T extends object> {
  filename: string;
  rows: readonly T[];
  sheetName?: string;
}

function formatHeader(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^./, (value) => value.toUpperCase());
}

function normalizeCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "";
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeCellValue(item))
      .filter((item) => item !== "" && item !== null && item !== undefined)
      .join(", ");
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${normalizeCellValue(item)}`)
      .filter((item) => item && item !== "undefined: ");
    return entries.join("; ");
  }
  return String(value);
}

async function fetchLogoImage(
  url: string,
): Promise<{ data: Uint8Array; extension: "png" | "jpeg" | "gif" } | null> {
  const match = url.split("?")[0].toLowerCase().match(/\.(png|jpe?g|gif)$/);
  if (!match) return null;

  const extension =
    match[1] === "jpg" || match[1] === "jpeg" ? "jpeg" : (match[1] as "png" | "gif");

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    return { data: new Uint8Array(buffer), extension };
  } catch {
    return null;
  }
}

export default function ExcelExportButton<T extends object>({
  filename,
  rows,
  sheetName = "Report",
}: ExcelExportButtonProps<T>) {
  const [exporting, setExporting] = useState(false);
  const { brand } = useSettings();

  const exportWorkbook = async () => {
    if (exporting || rows.length === 0) return;
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = brand.businessName;
      workbook.created = new Date();
      workbook.modified = new Date();

      const worksheet = workbook.addWorksheet(sheetName, {
        properties: { tabColor: { argb: "FF4169A1" } },
      });

      const keys = Object.keys(rows[0] as Record<string, unknown>);
      worksheet.columns = keys.map((key) => ({
        header: formatHeader(key),
        key,
        width: Math.max(18, Math.min(36, formatHeader(key).length + 8)),
      }));

      const normalizedRows = rows.map((row) =>
        keys.reduce<Record<string, unknown>>((result, key) => {
          result[key] = normalizeCellValue((row as Record<string, unknown>)[key]);
          return result;
        }, {}),
      );

      worksheet.addRows(normalizedRows);

      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } },
          };
          cell.alignment = { vertical: "middle" };
        });
      });

      // Branding rows on top: company name + report/sheet title
      worksheet.spliceRows(1, 0, [brand.businessName], [sheetName]);

      const lastCol = Math.max(keys.length, 1);
      if (lastCol > 1) {
        worksheet.mergeCells(1, 1, 1, lastCol);
        worksheet.mergeCells(2, 1, 2, lastCol);
      }

      const titleCell = worksheet.getCell(1, 1);
      titleCell.value = brand.businessName;
      titleCell.font = { bold: true, size: 14, color: { argb: "FF173F5F" } };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };

      const subtitleCell = worksheet.getCell(2, 1);
      subtitleCell.value = sheetName;
      subtitleCell.font = { size: 11, italic: true, color: { argb: "FF668397" } };
      subtitleCell.alignment = { vertical: "middle", horizontal: "left" };

      const logoImage = brand.logoUrl ? await fetchLogoImage(brand.logoUrl) : null;
      worksheet.getRow(1).height = logoImage ? 42 : 26;
      worksheet.getRow(2).height = 18;

      if (logoImage) {
        try {
          type AddImageArg = Parameters<ExcelJS.Workbook["addImage"]>[0];
          const imageId = workbook.addImage({
            buffer: logoImage.data as unknown as AddImageArg["buffer"],
            extension: logoImage.extension,
          });
          worksheet.addImage(imageId, {
            tl: { col: Math.max(lastCol - 1, 0) + 0.1, row: 0.1 },
            ext: { width: 32, height: 32 },
            editAs: "oneCell",
          });
        } catch {
          // unsupported image format — export continues without the logo
        }
      }

      // Column header row (now row 3 after inserting branding rows)
      const headerRow = worksheet.getRow(3);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4169A1" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FF1F2D3D" } },
          left: { style: "thin", color: { argb: "FF1F2D3D" } },
          bottom: { style: "thin", color: { argb: "FF1F2D3D" } },
          right: { style: "thin", color: { argb: "FF1F2D3D" } },
        };
      });

      worksheet.views = [{ state: "frozen", ySplit: 3 }];
      worksheet.autoFilter = {
        from: { row: 3, column: 1 },
        to: { row: 3, column: lastCol },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      className="no-print"
      type="button"
      onClick={exportWorkbook}
      disabled={exporting || rows.length === 0}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 20px",
        borderRadius: "10px",
        border: "1px solid var(--border)",
        backgroundColor: "var(--card)",
        color: "var(--ink)",
        fontWeight: 700,
        cursor: exporting ? "wait" : "pointer",
        opacity: exporting || rows.length === 0 ? 0.6 : 1,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {exporting ? "Preparing workbook..." : "Export Excel"}
    </button>
  );
}
