import { Module } from "@nestjs/common";
import { PipelineModule } from "../pipeline/pipeline.module";
import { ProposalsController } from "./proposals.controller";
import { ProposalsService } from "./proposals.service";

@Module({
  imports: [PipelineModule],
  controllers: [ProposalsController],
  providers: [ProposalsService],
})
export class ProposalsModule {}
