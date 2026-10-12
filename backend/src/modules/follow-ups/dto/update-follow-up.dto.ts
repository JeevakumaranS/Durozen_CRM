import { FollowUpStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateFollowUpDto {
  @IsEnum(FollowUpStatus)
  status!: FollowUpStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
