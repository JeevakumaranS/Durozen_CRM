import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateTeamUserDto } from "./dto/update-team-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  profile(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id, role: "ADMIN", isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        managerId: true,
        manager: { select: { id: true, fullName: true } },
      },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    });
  }

  listActiveManagers() {
    return this.prisma.user.findMany({
      where: { role: "SALES_MANAGER", isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
  }

  async listTeamPage(page: number, pageSize: number, search?: string) {
    const where: Prisma.UserWhereInput = {
      role: { in: ["BDE", "SALES_MANAGER"] },
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { manager: { is: { fullName: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          managerId: true,
          manager: { select: { id: true, fullName: true } },
          _count: { select: { leads: true, managedBdes: true } },
        },
        orderBy: [{ isActive: "desc" }, { role: "asc" }, { fullName: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async create(dto: CreateUserDto) {
    if (dto.role === "SALES_MANAGER" && dto.managerId) {
      throw new BadRequestException("Sales Managers cannot report to another user");
    }
    if (dto.role === "BDE" && dto.managerId) {
      await this.requireActiveManager(dto.managerId);
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: dto.role,
          managerId: dto.role === "BDE" ? dto.managerId : null,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          managerId: true,
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "An account already uses this email address",
        );
      }
      throw error;
    }
  }

  async updateTeamUser(id: string, dto: UpdateTeamUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true },
    });
    if (!existing || existing.role === "ADMIN") {
      throw new NotFoundException("Team account not found");
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          ...(existing.email.toLowerCase() !== dto.email.trim().toLowerCase()
            ? { tokenVersion: { increment: 1 } }
            : {}),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          managerId: true,
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "An account already uses this email address",
        );
      }
      throw error;
    }
  }

  async setManager(userId: string, managerId: string | null) {
    const bde = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!bde) throw new NotFoundException("User not found");
    if (bde.role !== "BDE") {
      throw new BadRequestException("Only BDE accounts can be assigned to a manager");
    }
    if (managerId) await this.requireActiveManager(managerId);

    return this.prisma.user.update({
      where: { id: userId },
      data: { managerId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        managerId: true,
      },
    });
  }

  private async requireActiveManager(managerId: string) {
    const manager = await this.prisma.user.findFirst({
      where: { id: managerId, role: "SALES_MANAGER", isActive: true },
      select: { id: true },
    });
    if (!manager) {
      throw new BadRequestException(
        "Choose an active Sales Manager for this BDE",
      );
    }
    return manager;
  }

  setActive(
    id: string,
    isActive: boolean,
  ): Promise<Pick<User, "id" | "fullName" | "email" | "role" | "isActive">> {
    return this.prisma.user.update({
      where: { id },
      data: { isActive, tokenVersion: { increment: 1 } },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  }

  async deleteTeamUser(id: string) {
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const user = await transaction.user.findUnique({
            where: { id },
            select: {
              id: true,
              role: true,
              _count: { select: { leads: true, managedBdes: true } },
            },
          });
          if (!user || user.role === "ADMIN") {
            throw new NotFoundException("Team account not found");
          }
          if (user.role === "BDE" && user._count.leads > 0) {
            throw new ConflictException(
              "This BDE owns leads. Reassign those leads before deleting the account.",
            );
          }
          if (user.role === "SALES_MANAGER" && user._count.managedBdes > 0) {
            throw new ConflictException(
              "This Sales Manager has BDEs assigned. Reassign those BDEs before deleting the account.",
            );
          }
          await transaction.user.delete({ where: { id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (
        error instanceof PrismaClientKnownRequestError &&
        ["P2003", "P2025", "P2034"].includes(error.code)
      ) {
        throw new ConflictException(
          "This account is still linked to CRM records. Reassign its records before deleting it.",
        );
      }
      throw error;
    }
    return { id, deleted: true };
  }
}
