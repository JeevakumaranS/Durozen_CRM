import { IsDateString } from "class-validator";

export class RescheduleCallMessageDto {
  @IsDateString()
  dueAt!: string;
}
