import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Reminder } from './reminder.entity';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { RemindersProcessor } from './reminders.processor';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder]),
    BullModule.registerQueue({ name: 'reminders' }),
    NotificationsModule,
  ],
  providers: [RemindersService, RemindersProcessor],
  controllers: [RemindersController],
  exports: [RemindersService],
})
export class RemindersModule {}
