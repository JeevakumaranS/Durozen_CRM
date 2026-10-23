import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ transactionOptions: { timeout: 15_000 } });
  }

  async onModuleInit() {
    await this.$connect();
  }
  async enableShutdownHooks(app: INestApplication) {
    this.$on("beforeExit" as never, async () => app.close());
  }
}
