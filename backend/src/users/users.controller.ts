import { Controller, Get, Patch, Delete, Body, Request, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}

type AuthReq = { user: { id: string } };

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Request() req: AuthReq) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me')
  updateMe(@Request() req: AuthReq, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  // GDPR Art. 17 — right to erasure; cascades to reminders and refresh tokens
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMe(@Request() req: AuthReq) {
    return this.usersService.deleteAccount(req.user.id);
  }
}
