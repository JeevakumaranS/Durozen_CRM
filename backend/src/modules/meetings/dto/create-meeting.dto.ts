import {
  IsDateString,
  IsBoolean,
  IsIn,
  IsNumber,
  IsNotEmpty,
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
  @IsOptional() @IsString() requirement?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) budget?: number;
  @IsOptional() @IsString() discussionNotes?: string;
  @IsOptional() @IsString() customerConcerns?: string;
  @IsString() @IsNotEmpty() nextAction!: string;
  @IsDateString() followUpAt!: string;
  @IsOptional() @IsBoolean() deferStageChange?: boolean;
}
