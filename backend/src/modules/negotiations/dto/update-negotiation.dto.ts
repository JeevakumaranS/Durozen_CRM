import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export class UpdateNegotiationDto {
  @IsOptional() @IsString() @Matches(/\S/) customerResponse?: string;
  @IsOptional() @IsIn(["Won", "Lost"]) nextAction?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() lostReason?: string;
}