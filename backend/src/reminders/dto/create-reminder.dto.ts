import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  IsObject,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ReminderCategory, RecurrenceType } from '../reminder.entity';

export class CreateReminderDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsEnum(ReminderCategory)
  category?: ReminderCategory;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsEnum(RecurrenceType)
  recurrence?: RecurrenceType;

  @IsOptional()
  @IsObject()
  recurrenceConfig?: {
    daysOfWeek?: number[];
    times?: string[];
    durationDays?: number;
    endDate?: string;
  };

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(5000)
  geofenceRadius?: number;

  @IsOptional()
  @IsString()
  sourceType?: string;
}
