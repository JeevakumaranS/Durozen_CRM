import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateMeetingDto {
  @IsUUID() leadId!: string;
  @IsDateString() meetingAt!: string;
  @IsIn([
    "Online Meeting",
    "Offline Meeting",
    "Product Demo",
    "Requirement Discussion",
    "Business Discussion",
  ])
  type!: string;
  @IsOptional() @IsString() participants?: string;
  @IsOptional() @IsString() requirement?: string;
  @IsOptional() @IsNumber() @Min(0) budget?: number;
  @IsOptional() @IsString() discussionNotes?: string;
  @IsOptional() @IsString() customerConcerns?: string;
  @IsString() nextAction!: string;
  @IsDateString() followUpAt!: string;
}
