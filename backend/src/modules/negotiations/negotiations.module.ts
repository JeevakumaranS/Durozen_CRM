import { Module } from "@nestjs/common";
import { PipelineModule } from "../pipeline/pipeline.module";
import { NegotiationsController } from "./negotiations.controller";
import { NegotiationsService } from "./negotiations.service";

@Module({
  imports: [PipelineModule],
  controllers: [NegotiationsController],
  providers: [NegotiationsService],
})
export class NegotiationsModule {}
