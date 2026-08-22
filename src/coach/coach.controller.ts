import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { AdminApiKeyGuard, ADMIN_API_KEY_HEADER } from '../common/guards/admin-api-key.guard';
import { CoachInsightsService } from './coach-insights.service';
import { CoachInsightsResponseDto } from './dto/coach-insights-response.dto';

@ApiTags('coach')
@Controller('coach')
export class CoachController {
  constructor(private readonly coachInsightsService: CoachInsightsService) {}

  @Get('insights/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminApiKeyGuard)
  @ApiOperation({
    summary: 'Get personalized coaching insights for a user',
    description:
      'Returns 1–3 LLM-generated coaching insights based on the user\'s prediction history and detected trend signals. ' +
      'Responses are cached per user for 1 hour to avoid unnecessary LLM calls. ' +
      'Pass `?refresh=true` (admin-only) to bypass the cache and force fresh generation. ' +
      `When using \`?refresh=true\`, include the \`${ADMIN_API_KEY_HEADER}\` header with a valid admin API key.`,
  })
  @ApiParam({
    name: 'userId',
    description: 'UUID of the user to fetch coaching insights for.',
    example: '550e8400-e29b-41d4-a716-446655440001',
    type: String,
  })
  @ApiQuery({
    name: 'refresh',
    description:
      'Set to true to bypass the cache and regenerate insights from the LLM. ' +
      `Admin-only: requires the \`${ADMIN_API_KEY_HEADER}\` header.`,
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiHeader({
    name: ADMIN_API_KEY_HEADER,
    description:
      'Admin API key. Required only when `?refresh=true` is passed. ' +
      'Must match the ADMIN_API_KEY environment variable configured on the server.',
    required: false,
    example: 'super-secret-admin-key',
  })
  @ApiResponse({
    status: 200,
    description: 'Coaching insights retrieved successfully.',
    type: CoachInsightsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid userId — must be a valid UUID.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed (uuid is expected)',
        error: 'Bad Request',
        timestamp: '2026-08-21T20:00:00.000Z',
        path: '/api/v1/coach/insights/not-a-uuid',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'ADMIN_API_KEY is not configured on the server.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Admin API key is not configured on this server. Contact the platform administrator.',
        error: 'Unauthorized',
        timestamp: '2026-08-21T20:00:00.000Z',
        path: '/api/v1/coach/insights/550e8400-e29b-41d4-a716-446655440001',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: `?refresh=true was requested but the \`${ADMIN_API_KEY_HEADER}\` header is missing or incorrect.`,
    schema: {
      example: {
        statusCode: 403,
        message: 'A valid admin API key is required to bypass the cache with ?refresh=true.',
        error: 'Forbidden',
        timestamp: '2026-08-21T20:00:00.000Z',
        path: '/api/v1/coach/insights/550e8400-e29b-41d4-a716-446655440001',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        statusCode: 404,
        message: "User '550e8400-0000-0000-0000-000000000000' not found",
        error: 'Not Found',
        timestamp: '2026-08-21T20:00:00.000Z',
        path: '/api/v1/coach/insights/550e8400-0000-0000-0000-000000000000',
      },
    },
  })
  async getInsights(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query('refresh') refresh?: string,
  ): Promise<CoachInsightsResponseDto> {
    const forceRefresh = refresh === 'true' || refresh === '1';
    return this.coachInsightsService.getInsights(userId, forceRefresh);
  }
}
