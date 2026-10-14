import { IsDateString } from "class-validator";

export class RescheduleMeetingDto {
  @IsDateString()
  meetingAt!: string;
}
