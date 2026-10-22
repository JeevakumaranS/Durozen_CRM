import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class UpdateMeetingDto {
  @IsOptional()
  @IsIn([
    "Online Meeting",
    "Offline Meeting",
    "Product Demo",
    "Requirement Discussion",
    "Business Discussion",
  ])
  type?: string;

  @IsOptional() @IsString() requirement?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) budget?: number | null;
  @IsOptional() @IsString() discussionNotes?: string | null;
  @IsOptional() @IsString() customerConcerns?: string | null;
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsDateString() followUpAt?: string;
}
