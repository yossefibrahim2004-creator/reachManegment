import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import {
  UPLOADS_DIR,
  ALLOWED_IMAGE_EXTENSIONS,
  MAX_LOGO_SIZE,
  ensureUploadsDir,
} from './uploads.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get('brand')
  @ApiOperation({ summary: 'Public brand info (name, contact, logo) for login and chrome' })
  async brand() {
    const settings = await this.settingsService.get();
    return {
      businessName: settings.businessName,
      address: settings.address,
      phone: settings.phone,
      logoUrl: settings.logoUrl,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get application settings' })
  async get() {
    return this.settingsService.get();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update application settings (admin)' })
  async update(@Body() body: UpdateSettingsDto) {
    return this.settingsService.update(body);
  }

  @Post('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload business logo (admin)' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          ensureUploadsDir();
          callback(null, UPLOADS_DIR);
        },
        filename: (_req, file, callback) => {
          const extension = extname(file.originalname).toLowerCase();
          callback(null, `${randomUUID()}${extension}`);
        },
      }),
      limits: { fileSize: MAX_LOGO_SIZE },
      fileFilter: (_req, file, callback) => {
        const extension = extname(file.originalname).toLowerCase();
        if (
          !ALLOWED_IMAGE_EXTENSIONS.has(extension) ||
          !file.mimetype?.startsWith('image/')
        ) {
          callback(
            new BadRequestException('Only PNG, JPG, WEBP, or SVG images are allowed'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    return this.settingsService.setLogo(`/uploads/${file.filename}`);
  }

  @Delete('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove business logo (admin)' })
  async removeLogo() {
    return this.settingsService.clearLogo();
  }
}
