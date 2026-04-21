import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

type AuthReq = { user: { id: string } };

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  create(@Request() req: AuthReq, @Body() dto: CreateReminderDto) {
    return this.remindersService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: AuthReq) {
    return this.remindersService.findAllForUser(req.user.id);
  }

  @Get('today')
  getToday(@Request() req: AuthReq) {
    return this.remindersService.getTodaysReminders(req.user.id);
  }

  @Get('missed')
  getMissed(@Request() req: AuthReq) {
    return this.remindersService.getFrequentlyMissed(req.user.id);
  }

  @Get('firing')
  getFiring(@Request() req: AuthReq) {
    return this.remindersService.getFiring(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: AuthReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Request() req: AuthReq,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateReminderDto>,
  ) {
    return this.remindersService.update(req.user.id, id, dto);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Request() req: AuthReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.markCompleted(req.user.id, id);
  }

  @Patch(':id/snooze')
  @HttpCode(HttpStatus.OK)
  snooze(
    @Request() req: AuthReq,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('minutes') minutes?: string,
  ) {
    const mins = minutes ? Math.max(1, Math.min(120, parseInt(minutes, 10))) : undefined;
    return this.remindersService.snooze(req.user.id, id, mins);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: AuthReq, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.remove(req.user.id, id);
  }
}
