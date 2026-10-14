import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

for (const path of [
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), ".env"),
]) {
  if (existsSync(path)) process.loadEnvFile(path);
}

const prisma = new PrismaClient();

function prompt(label: string): Promise<string> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    terminal.question(label, (answer) => {
      terminal.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(label: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Admin creation requires an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    output.write(label);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";

    const finish = (error?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Admin creation cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };

    input.on("data", onData);
  });
}

async function main() {
  const fullName = await prompt("Admin full name: ");
  const email = (await prompt("Admin email: ")).toLowerCase();
  if (!fullName) throw new Error("Full name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  const password = await promptHidden("Admin password (minimum 12 characters): ");
  if (password.length < 12) {
    throw new Error("Admin password must be at least 12 characters.");
  }
  const confirmation = await promptHidden("Confirm admin password: ");
  if (password !== confirmation) {
    throw new Error("Passwords do not match.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== UserRole.ADMIN) {
    throw new Error("That email belongs to a non-admin account.");
  }
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName,
          passwordHash,
          isActive: true,
          tokenVersion: { increment: 1 },
        },
        select: { id: true, fullName: true, email: true },
      })
    : await prisma.user.create({
        data: {
          fullName,
          email,
          passwordHash,
          role: UserRole.ADMIN,
        },
        select: { id: true, fullName: true, email: true },
      });
  console.info(
    `Admin account ${existing ? "updated" : "created"} for ${user.email} (${user.id}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Unable to create admin account.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
