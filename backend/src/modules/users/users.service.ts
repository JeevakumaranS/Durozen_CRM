import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    });
  }

  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: dto.role,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "An account already uses this email address",
        );
      }
      throw error;
    }
  }

  setActive(
    id: string,
    isActive: boolean,
  ): Promise<Pick<User, "id" | "fullName" | "email" | "role" | "isActive">> {
    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  }
}
