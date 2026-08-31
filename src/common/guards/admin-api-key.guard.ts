import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

export const ADMIN_API_KEY_HEADER = 'x-admin-api-key';

/**
 * AdminApiKeyGuard
 *
 * Guards routes that expose admin-only functionality via query params.
 * When `?refresh=true` is present in the request, the guard requires a
 * valid `x-admin-api-key` header matching the `ADMIN_API_KEY` environment
 * variable.
 *
 * If `?refresh` is absent or falsy the guard passes unconditionally,
 * so regular users can hit the same endpoint without a key.
 *
 * Responses:
 * - 401 Unauthorized — header is present but the ADMIN_API_KEY env var is
 *   not configured (mis-configuration on the server side).
 * - 403 Forbidden — `refresh=true` was requested but the key is missing or
 *   incorrect.
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const refresh = request.query['refresh'];
    const isRefreshRequested = refresh === 'true' || refresh === '1';

    // If the caller isn't asking for a cache bypass, let the request through.
    if (!isRefreshRequested) {
      return true;
    }

    // At this point the caller wants ?refresh=true — they must be admin.
    const configuredKey = process.env.ADMIN_API_KEY;
    if (!configuredKey) {
      // Server-side misconfiguration: admin key not set but refresh is
      // being attempted. Return 401 to signal auth is not available.
      throw new UnauthorizedException(
        'Admin API key is not configured on this server. Contact the platform administrator.',
      );
    }

    const providedKey = request.headers[ADMIN_API_KEY_HEADER];
    if (!providedKey || providedKey !== configuredKey) {
      throw new ForbiddenException(
        'A valid admin API key is required to bypass the cache with ?refresh=true.',
      );
    }

    return true;
  }
}
