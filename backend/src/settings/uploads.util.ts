import { basename, join, resolve } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';

export const UPLOADS_DIR = join(process.cwd(), 'uploads');
export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
]);
export const MAX_LOGO_SIZE = 2 * 1024 * 1024;

export function ensureUploadsDir(): void {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function deleteUploadFile(filename: string): void {
  try {
    const target = resolve(UPLOADS_DIR, basename(filename));
    if (target.startsWith(resolve(UPLOADS_DIR)) && existsSync(target)) {
      unlinkSync(target);
    }
  } catch {
    /* best-effort cleanup */
  }
}
