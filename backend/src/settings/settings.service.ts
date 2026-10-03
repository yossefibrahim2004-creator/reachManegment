import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deleteUploadFile } from './uploads.util';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get current application settings
   */
  async get() {
    let settings = await this.prisma.appSetting.findUnique({
      where: { id: 1 },
    });

    if (!settings) {
      // Initialize with defaults
      settings = await this.prisma.appSetting.create({
        data: {
          id: 1,
          businessName: 'Pallet POS',
          currency: 'EGP',
          timezone: 'Africa/Cairo',
          invoicePrefix: 'INV',
        },
      });
    }

    return settings;
  }

  /**
   * Update application settings
   * Currency is always EGP, timezone is always Africa/Cairo
   */
  async update(data: {
    businessName?: string;
    address?: string;
    phone?: string;
    logoUrl?: string;
    currency?: string;
    timezone?: string;
    invoicePrefix?: string;
  }) {
    // Ensure settings exist
    await this.get();

    // Force Egyptian configuration
    const safeData = { ...data };
    delete safeData.currency;
    delete safeData.timezone;

    if ('logoUrl' in safeData && safeData.logoUrl !== undefined) {
      // Logo changes go through upload/delete endpoints only
      delete safeData.logoUrl;
    }

    return this.prisma.appSetting.update({
      where: { id: 1 },
      data: safeData,
    });
  }

  /**
   * Set logo URL after a successful file upload, removing the previous file
   */
  async setLogo(logoUrl: string) {
    await this.get();
    const current = await this.prisma.appSetting.findUnique({ where: { id: 1 } });
    const previous = current?.logoUrl;

    const settings = await this.prisma.appSetting.update({
      where: { id: 1 },
      data: { logoUrl },
    });

    if (previous && previous.startsWith('/uploads/')) {
      deleteUploadFile(previous.slice('/uploads/'.length));
    }

    return settings;
  }

  /**
   * Clear logo and delete the uploaded file
   */
  async clearLogo() {
    await this.get();
    const current = await this.prisma.appSetting.findUnique({ where: { id: 1 } });
    const previous = current?.logoUrl;

    const settings = await this.prisma.appSetting.update({
      where: { id: 1 },
      data: { logoUrl: null },
    });

    if (previous && previous.startsWith('/uploads/')) {
      deleteUploadFile(previous.slice('/uploads/'.length));
    }

    return settings;
  }
}
