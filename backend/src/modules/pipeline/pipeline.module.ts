import { Module } from "@nestjs/common";
import { StageTransitionService } from "./stage-transition.service";

@Module({
  providers: [StageTransitionService],
  exports: [StageTransitionService],
})
export class PipelineModule {}
