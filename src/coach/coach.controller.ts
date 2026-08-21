import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { CoachInsightsService } from './coach-insights.service';
import { CoachInsightsResponseDto } from './dto/coach-insights-response.dto';

@ApiTags('coach')
@Controller('coach')
export class CoachController {
  constructor(private readonly coachInsightsService: CoachInsightsService) {}

  @Get('insights/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get personalized coaching insights for a user',
    description:
      'Returns 1–3 LLM-generated coaching insights based on the user\'s prediction history and detected trend signals. ' +
      'Responses are cached per user for 1 hour to avoid unnecessary LLM calls. ' +
      'Pass `?refresh=true` to bypass the cache and force fresh generation.',
  })
  @ApiParam({
    name: 'userId',
    description: 'UUID of the user to fetch coaching insights for.',
    example: '550e8400-e29b-41d4-a716-446655440001',
    type: String,
  })
  @ApiQuery({
    name: 'refresh',
    description: 'Set to true to bypass the cache and regenerate insights from the LLM.',
    required: false,
    type: Boolean,
    example: false,
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
