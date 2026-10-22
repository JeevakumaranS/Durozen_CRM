import { IsNumber, Min } from "class-validator";

export class RecordLeadPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}
