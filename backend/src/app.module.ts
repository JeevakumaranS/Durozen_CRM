import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./modules/auth/auth.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./modules/users/users.module";
import { PipelineModule } from "./modules/pipeline/pipeline.module";
import { FollowUpsModule } from "./modules/follow-ups/follow-ups.module";
import { ActivitiesModule } from "./modules/activities/activities.module";
import { MeetingsModule } from "./modules/meetings/meetings.module";
import { ProposalsModule } from "./modules/proposals/proposals.module";
import { NegotiationsModule } from "./modules/negotiations/negotiations.module";
import { DealsModule } from "./modules/deals/deals.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { PerformanceModule } from "./modules/performance/performance.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AdminModule } from "./modules/admin/admin.module";
import { validateEnvironment } from "./config/env.validation";
import { GuardsModule } from "./common/guards/guards.module";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../.env", ".env"],
      validate: validateEnvironment,
    }),
    PrismaModule,
    GuardsModule,
    AuthModule,
    DashboardModule,
    LeadsModule,
    UsersModule,
    PipelineModule,
    FollowUpsModule,
    ActivitiesModule,
    MeetingsModule,
    ProposalsModule,
    NegotiationsModule,
    DealsModule,
    CustomersModule,
    PerformanceModule,
    ReportsModule,
    ExportsModule,
    SettingsModule,
    NotificationsModule,
    JobsModule,
    AuditModule,
    AdminModule,
  ],
})
export class AppModule {}
