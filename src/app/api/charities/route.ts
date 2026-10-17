import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";

const DEFAULT_VETTED_CHARITIES = [
  {
    name: "St. Jude Children's Research Hospital",
    description:
      "Helps kids with cancer and other life-threatening diseases receive free medical care.",
    category: "HEALTH_KIDS",
    paypalEmail: "donations-sandbox@stjude.example.org",
    websiteUrl: "https://www.stjude.org",
  },
  {
    name: "World Wildlife Fund (WWF)",
    description:
      "Protects endangered animals like giant pandas, tigers, and sea turtles around the world.",
    category: "ANIMALS_NATURE",
    paypalEmail: "giving-sandbox@wwf.example.org",
    websiteUrl: "https://www.worldwildlife.org",
  },
  {
    name: "Feeding America",
    description:
      "Provides healthy meals to families and children through community food banks.",
    category: "HUNGER_RELIEF",
    paypalEmail: "donate-sandbox@feedingamerica.example.org",
    websiteUrl: "https://www.feedingamerica.org",
  },
  {
    name: "Room to Read",
    description:
      "Builds school libraries and publishes children's books so every child can learn to read.",
    category: "EDUCATION",
    paypalEmail: "books-sandbox@roomtoread.example.org",
    websiteUrl: "https://www.roomtoread.org",
  },
  {
    name: "The Ocean Cleanup",
    description:
      "Develops advanced technologies to rid the world's oceans and rivers of plastic pollution.",
    category: "ENVIRONMENT",
    paypalEmail: "oceans-sandbox@theoceancleanup.example.org",
    websiteUrl: "https://theoceancleanup.com",
  },
];

async function ensureCharitiesSeeded() {
  const count = await prisma.charity.count();
  if (count > 0) return;

  await prisma.charity.createMany({
    data: DEFAULT_VETTED_CHARITIES,
  });
}

/**
 * GET /api/charities
 * Lists the vetted list of charities a child can choose from for their Give bucket (FR-8.1).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    await ensureCharitiesSeeded();

    const category = req.nextUrl.searchParams.get("category");

    const charities = await prisma.charity.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
      },
      orderBy: { name: "asc" },
    });

    return apiSuccess({ charities });
  } catch (error) {
    return handleRouteError(error);
  }
}
