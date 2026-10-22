import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from "class-validator";

export class CompleteMeetingDto {
  @IsString()
  @IsNotEmpty()
  requirement!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budget?: number | null;

  @IsOptional()
  @IsString()
  discussionNotes?: string;

  @IsIn(["Proposal", "Lost"])
  nextAction!: string;

  @ValidateIf((dto: CompleteMeetingDto) => dto.nextAction === "Proposal")
  @IsDateString()
  followUpAt?: string;

  @ValidateIf((dto: CompleteMeetingDto) => dto.nextAction === "Lost")
  @IsString()
  @IsNotEmpty()
  lostReason?: string;
}
