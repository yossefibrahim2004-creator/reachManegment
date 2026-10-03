import type { TranslationKey } from "../i18n";

export enum AppErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  FORBIDDEN_ROLE = 'FORBIDDEN_ROLE',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  USERNAME_ALREADY_EXISTS = 'USERNAME_ALREADY_EXISTS',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  QR_TOKEN_INVALID = 'QR_TOKEN_INVALID',
  QR_TOKEN_EXPIRED = 'QR_TOKEN_EXPIRED',
  QR_ACTION_MISMATCH = 'QR_ACTION_MISMATCH',
  QR_WORKPLACE_MISMATCH = 'QR_WORKPLACE_MISMATCH',
  ALREADY_CHECKED_IN = 'ALREADY_CHECKED_IN',
  NOT_CHECKED_IN = 'NOT_CHECKED_IN',
  KIOSK_NOT_CONFIGURED = 'KIOSK_NOT_CONFIGURED',
  RATE_LIMITED = 'RATE_LIMITED',
}

export type AppMessageCode = keyof typeof AppErrorCode | AppErrorCode;

function buildApiMessageMap(t: TranslationKey): Record<AppErrorCode, string> {
  return {
    [AppErrorCode.VALIDATION_ERROR]: t.errors.common.requiredFields,
    [AppErrorCode.INVALID_CREDENTIALS]: t.errors.auth.invalidCredentials,
    [AppErrorCode.ACCOUNT_INACTIVE]: t.errors.auth.accountInactive,
    [AppErrorCode.TOKEN_EXPIRED]: t.errors.auth.tokenExpired,
    [AppErrorCode.FORBIDDEN_ROLE]: t.errors.auth.forbiddenRole,
    [AppErrorCode.EMAIL_ALREADY_EXISTS]: t.errors.auth.emailInUse,
    [AppErrorCode.USERNAME_ALREADY_EXISTS]: t.errors.auth.usernameInUse,
    [AppErrorCode.NOT_FOUND]: t.errors.auth.notFound,
    [AppErrorCode.CONFLICT]: t.errors.auth.conflict,
    [AppErrorCode.UNAUTHORIZED]: t.errors.auth.unauthorized,
    [AppErrorCode.INTERNAL_SERVER_ERROR]: t.errors.common.unexpectedError,
    [AppErrorCode.CONNECTION_ERROR]: t.errors.common.connectionIssue,
    [AppErrorCode.QR_TOKEN_INVALID]: t.errors.attendance.qrInvalid,
    [AppErrorCode.QR_TOKEN_EXPIRED]: t.errors.attendance.qrExpired,
    [AppErrorCode.QR_ACTION_MISMATCH]: t.errors.attendance.qrActionMismatch,
    [AppErrorCode.QR_WORKPLACE_MISMATCH]: t.errors.attendance.qrWorkplaceMismatch,
    [AppErrorCode.ALREADY_CHECKED_IN]: t.errors.attendance.alreadyCheckedIn,
    [AppErrorCode.NOT_CHECKED_IN]: t.errors.attendance.notCheckedIn,
    [AppErrorCode.KIOSK_NOT_CONFIGURED]: t.errors.attendance.kioskNotConfigured,
    [AppErrorCode.RATE_LIMITED]: t.errors.attendance.rateLimited,
  };
}

function fillTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function getFriendlyErrorMessage(error: unknown, t: TranslationKey, fallback?: string): string {
  const fallbackMsg = fallback ?? t.errors.common.unexpectedError;

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: string | string[];
      code?: string;
      response?: {
        data?: {
          message?: string | string[];
          code?: string;
          statusCode?: number;
        } & Record<string, unknown>;
      };
    };

    const payload = (candidate.response?.data ?? candidate) as {
      message?: string | string[];
      code?: string;
      statusCode?: number;
    } & Record<string, unknown>;

    const apiMessage = payload.message ?? candidate.message;

    // class-validator failures arrive as an array of constraint strings.
    if (Array.isArray(apiMessage)) {
      const joined = apiMessage
        .filter((m): m is string => typeof m === 'string' && Boolean(m.trim()))
        .join(' • ');
      if (joined) {
        return joined;
      }
    }

    const apiCode = typeof payload.code === 'string'
      ? payload.code
      : typeof candidate.code === 'string'
        ? candidate.code
        : undefined;

    if (apiCode) {
      const deliveryMessages = t.errors.delivery as unknown as Record<string, string>;
      const deliveryTemplate = deliveryMessages[apiCode];
      if (deliveryTemplate) {
        return fillTemplate(deliveryTemplate, payload);
      }

      const API_MESSAGE_MAP = buildApiMessageMap(t);
      if (apiCode in API_MESSAGE_MAP) {
        return API_MESSAGE_MAP[apiCode as AppMessageCode];
      }
    }

    if (typeof apiMessage === 'string' && apiMessage.trim()) {
      return apiMessage;
    }

    if (payload.statusCode === 500 || payload.statusCode === 503) {
      return t.errors.common.connectionIssue;
    }
  }

  return fallbackMsg;
}
