import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { ParserService } from './parser.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class ParseTextDto {
  @IsString()
  @MaxLength(500)
  text: string;
}

@Controller('parser')
@UseGuards(JwtAuthGuard)
export class ParserController {
  constructor(private readonly parserService: ParserService) {}

  @Post('text')
  parseText(@Request() req, @Body() dto: ParseTextDto) {
    const tz = req.user.timezone ?? 'UTC';
    return this.parserService.parseNaturalLanguage(dto.text, tz);
  }
}
