import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateReminderDto) {
    return this.remindersService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req) {
    return this.remindersService.findAllForUser(req.user.id);
  }

  @Get('today')
  getToday(@Request() req) {
    return this.remindersService.getTodaysReminders(req.user.id);
  }

  @Get('missed')
  getMissed(@Request() req) {
    return this.remindersService.getFrequentlyMissed(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateReminderDto>,
  ) {
    return this.remindersService.update(req.user.id, id, dto);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.markCompleted(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.remove(req.user.id, id);
  }
}
