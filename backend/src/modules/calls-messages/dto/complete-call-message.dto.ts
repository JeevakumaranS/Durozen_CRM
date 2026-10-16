import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from "class-validator";

export class CompleteCallMessageDto {
  @IsIn(["Interested", "Not Interested", "Decision pending"])
  responseAction!: string;

  @IsDateString()
  contactDate!: string;

  @ValidateIf((dto: CompleteCallMessageDto) => dto.responseAction !== "Not Interested")
  @IsString()
  @IsNotEmpty()
  customerResponse?: string;

  @ValidateIf((dto: CompleteCallMessageDto) => dto.responseAction !== "Not Interested")
  @IsString()
  @IsNotEmpty()
  requirement?: string;

  @ValidateIf((dto: CompleteCallMessageDto) => dto.responseAction === "Not Interested")
  @IsString()
  @IsNotEmpty()
  lostReason?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsBoolean()
  scheduleMeeting?: boolean;

  @IsOptional()
  @IsDateString()
  meetingAt?: string;

  @IsOptional()
  @IsIn([
    "Online Meeting",
    "Offline Meeting",
    "Product Demo",
    "Requirement Discussion",
    "Business Discussion",
  ])
  meetingType?: string;
}
