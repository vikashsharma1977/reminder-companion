import { Controller, Post, Body, Query, Request, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { ParserService } from './parser.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class ParseTextDto {
  @IsString()
  @MaxLength(500)
  text: string;
}

type AuthReq = { user: { id: string; timezone?: string } };

@Controller('parser')
@UseGuards(JwtAuthGuard)
export class ParserController {
  constructor(private readonly parserService: ParserService) {}

  @Post('text')
  parseText(
    @Request() req: AuthReq,
    @Body() dto: ParseTextDto,
    @Query('tz') tz?: string,
  ) {
    // Browser-detected tz is most accurate; profile timezone is the fallback for when tz isn't sent
    const timezone = tz || req.user.timezone || 'UTC';
    return this.parserService.parseNaturalLanguage(dto.text, timezone);
  }
}
