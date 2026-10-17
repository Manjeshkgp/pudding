import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";

interface ChoreTemplateItem {
  title: string;
  description: string;
  suggestedRewardAmount: string;
  recurrence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";
  ageGroupTag: "AGE_6_9" | "AGE_10_13" | "AGE_14_17";
}

const DEFAULT_CHORE_TEMPLATES: ChoreTemplateItem[] = [
  // Ages 6-9
  {
    title: "Make Your Bed",
    description: "Pull up the sheets, fluff pillows, and tidy stuffed animals.",
    suggestedRewardAmount: "1.00",
    recurrence: "DAILY",
    ageGroupTag: "AGE_6_9",
  },
  {
    title: "Put Away Toys & Books",
    description: "Pick up all toys and books from the floor and put them in their bins.",
    suggestedRewardAmount: "1.50",
    recurrence: "DAILY",
    ageGroupTag: "AGE_6_9",
  },
  {
    title: "Feed Family Pet",
    description: "Refill food and fresh water bowl for our family pet.",
    suggestedRewardAmount: "1.50",
    recurrence: "DAILY",
    ageGroupTag: "AGE_6_9",
  },
  {
    title: "Set the Dinner Table",
    description: "Place plates, napkins, and utensils for everyone before dinner.",
    suggestedRewardAmount: "1.00",
    recurrence: "DAILY",
    ageGroupTag: "AGE_6_9",
  },
  // Ages 10-13
  {
    title: "Take Out Trash & Recycling",
    description: "Empty indoor bins and take trash and recycling to the outdoor bins.",
    suggestedRewardAmount: "3.00",
    recurrence: "WEEKLY",
    ageGroupTag: "AGE_10_13",
  },
  {
    title: "Load & Unload Dishwasher",
    description: "Put clean dishes away and load dirty dishes into the dishwasher.",
    suggestedRewardAmount: "2.50",
    recurrence: "DAILY",
    ageGroupTag: "AGE_10_13",
  },
  {
    title: "Vacuum Living Room & Bedroom",
    description: "Vacuum the rugs and floors in the living room and your bedroom.",
    suggestedRewardAmount: "4.00",
    recurrence: "WEEKLY",
    ageGroupTag: "AGE_10_13",
  },
  {
    title: "Fold & Put Away Laundry",
    description: "Fold your clean clothes and put them neatly into your drawers/closet.",
    suggestedRewardAmount: "3.50",
    recurrence: "WEEKLY",
    ageGroupTag: "AGE_10_13",
  },
  // Ages 14-17
  {
    title: "Mow the Lawn / Yard Work",
    description: "Mow the yard, rake leaves, or water the garden beds.",
    suggestedRewardAmount: "10.00",
    recurrence: "WEEKLY",
    ageGroupTag: "AGE_14_17",
  },
  {
    title: "Wash the Family Car",
    description: "Wash the exterior and vacuum the interior of the family car.",
    suggestedRewardAmount: "12.00",
    recurrence: "MONTHLY",
    ageGroupTag: "AGE_14_17",
  },
  {
    title: "Clean Bathroom",
    description: "Wipe sink, mirror, counter, and scrub toilet.",
    suggestedRewardAmount: "7.50",
    recurrence: "WEEKLY",
    ageGroupTag: "AGE_14_17",
  },
  {
    title: "Help Cook Family Dinner",
    description: "Prepare ingredients and help cook dinner for the family.",
    suggestedRewardAmount: "6.00",
    recurrence: "WEEKLY",
    ageGroupTag: "AGE_14_17",
  },
];

/**
 * GET /api/chores/templates?ageGroup=AGE_6_9|AGE_10_13|AGE_14_17
 * Returns the library of suggested chores by age group (FR-5.2), combining built-in defaults
 * with any admin-created templates in the database.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const ageGroupFilter = req.nextUrl.searchParams.get("ageGroup");

    const dbTemplates = await prisma.chore.findMany({
      where: {
        isTemplate: true,
        isActive: true,
        ...(ageGroupFilter ? { ageGroupTag: ageGroupFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    const filteredDefaults = ageGroupFilter
      ? DEFAULT_CHORE_TEMPLATES.filter((t) => t.ageGroupTag === ageGroupFilter)
      : DEFAULT_CHORE_TEMPLATES;

    return apiSuccess({
      templates: [
        ...dbTemplates.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          suggestedRewardAmount: t.rewardAmount.toString(),
          recurrence: t.recurrence,
          ageGroupTag: t.ageGroupTag,
          source: "ADMIN_DB",
        })),
        ...filteredDefaults.map((t, idx) => ({
          id: `default-template-${idx + 1}`,
          ...t,
          source: "BUILT_IN",
        })),
      ],
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
