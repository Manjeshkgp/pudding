import { AgeGroup, LessonTopic, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

interface SeedBadge {
  code: string;
  name: string;
  description: string;
  icon: string;
  xpBonus: number;
}

const DEFAULT_BADGES: SeedBadge[] = [
  {
    code: "SAVER_STAR",
    name: "Saver Star",
    description: "Completed the Saving Superpowers lesson!",
    icon: "piggy-bank",
    xpBonus: 50,
  },
  {
    code: "SMART_SHOPPER",
    name: "Smart Shopper",
    description: "Mastered Needs vs. Wants!",
    icon: "shopping-bag",
    xpBonus: 50,
  },
  {
    code: "BUDGET_BOSS",
    name: "Budget Boss",
    description: "Learned how to plan a Spend and Save budget!",
    icon: "pie-chart",
    xpBonus: 75,
  },
  {
    code: "COMPOUND_WIZARD",
    name: "Compound Wizard",
    description: "Unlocked the secret of compounding interest!",
    icon: "trending-up",
    xpBonus: 75,
  },
  {
    code: "SCAM_SHIELD",
    name: "Scam Shield",
    description: "Trained to spot online scams and protect money!",
    icon: "shield-check",
    xpBonus: 100,
  },
];

interface SeedLesson {
  title: string;
  slug: string;
  topic: LessonTopic;
  ageGroup: AgeGroup;
  summary: string;
  content: Record<string, unknown>;
  quizQuestions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>;
  xpReward: number;
  defaultMoneyReward: string;
  badgeCode: string;
  orderIndex: number;
}

const DEFAULT_LESSONS: SeedLesson[] = [
  {
    title: "The Magic of Saving First",
    slug: "magic-of-saving-first",
    topic: "SAVING",
    ageGroup: "AGE_6_9",
    summary:
      "Learn why putting a little bit of money into your Save bucket every week helps you buy big dreams!",
    content: {
      story:
        "Maya wanted a $20 scooter. Instead of spending all her $5 weekly allowance on candy, she put $2 into her Save bucket every week. With her parent's 25% match, she got her scooter even faster!",
      keyTakeaways: [
        "Save a portion of every allowance before spending.",
        "Small amounts add up over time.",
        "Setting a clear goal makes saving fun!",
      ],
    },
    quizQuestions: [
      {
        question: "What happens when you put money in your Save bucket?",
        options: [
          "It disappears forever",
          "It stays safe and grows toward your big goals",
          "It turns into candy",
        ],
        correctIndex: 1,
        explanation:
          "Money in your Save bucket is kept safe so you can reach bigger goals!",
      },
      {
        question:
          "If you save $2 every week, how much will you have in 5 weeks?",
        options: ["$5", "$10", "$20"],
        correctIndex: 1,
        explanation: "$2 x 5 weeks = $10 saved!",
      },
    ],
    xpReward: 50,
    defaultMoneyReward: "0.50",
    badgeCode: "SAVER_STAR",
    orderIndex: 1,
  },
  {
    title: "Needs vs. Wants Detective",
    slug: "needs-vs-wants-detective",
    topic: "NEEDS_VS_WANTS",
    ageGroup: "AGE_6_9",
    summary:
      "Can you tell the difference between things we NEED to live and things we WANT for fun?",
    content: {
      story:
        "Every day we make choices with money. Healthy food, warm clothes, and school supplies are NEEDS. Video games, extra toys, and ice cream are WANTS. Wants are great—we just pay for NEEDS first!",
      keyTakeaways: [
        "Needs are things required to stay healthy and safe.",
        "Wants are fun extras we can save up for.",
        "Wait 24 hours before buying an impulse Want!",
      ],
    },
    quizQuestions: [
      {
        question: "Which of these is a NEED?",
        options: [
          "A new video game skin",
          "Winter jacket and school lunch",
          "A glow-in-the-dark skateboard",
        ],
        correctIndex: 1,
        explanation: "Food and warm clothing are essential needs!",
      },
      {
        question: "What is a smart trick before buying something you WANT?",
        options: [
          "Sleep on it for 24 hours to see if you still really want it",
          "Buy it immediately without checking the price",
          "Borrow money from everyone",
        ],
        correctIndex: 0,
        explanation: "Waiting 24 hours prevents impulse spending regrets!",
      },
    ],
    xpReward: 50,
    defaultMoneyReward: "0.50",
    badgeCode: "SMART_SHOPPER",
    orderIndex: 2,
  },
  {
    title: "Mastering the 70 / 20 / 10 Rule",
    slug: "mastering-70-20-10-budget",
    topic: "BUDGETING",
    ageGroup: "AGE_10_13",
    summary:
      "Discover how splitting your money into Spend and Save buckets gives you total control.",
    content: {
      story:
        "A budget isn't about restricting your fun—it's a game plan for your money! With 70% in Spend and 30% in Save, you can enjoy today and build for tomorrow.",
      keyTakeaways: [
        "Spend bucket: for everyday fun and approved purchases.",
        "Save bucket: for long-term goals and emergencies.",
      ],
    },
    quizQuestions: [
      {
        question:
          "If you earn $10 and use a 70/20/10 split, how much goes into your Save bucket?",
        options: ["$7.00", "$2.00", "$1.00"],
        correctIndex: 1,
        explanation: "20% of $10.00 is $2.00 for your Save bucket!",
      },
      {
        question: "Why do smart money managers use a budget?",
        options: [
          "So they know where their money goes and never run out unexpectedly",
          "Because math is hard",
          "To spend 100% on day one",
        ],
        correctIndex: 0,
        explanation:
          "A budget ensures you always have money for what matters most.",
      },
    ],
    xpReward: 75,
    defaultMoneyReward: "1.00",
    badgeCode: "BUDGET_BOSS",
    orderIndex: 3,
  },
  {
    title: "The Snowball Effect: Compounding Interest",
    slug: "snowball-compounding-interest",
    topic: "INTEREST",
    ageGroup: "AGE_10_13",
    summary:
      "See how your money can earn its own money when interest compounds over time!",
    content: {
      story:
        "Imagine rolling a small snowball down a snowy hill. As it rolls, it picks up more snow and gets bigger faster! Compounding interest works the same way: you earn interest on your original savings AND on the interest you already earned.",
      keyTakeaways: [
        "Interest is a reward paid for keeping money saved.",
        "Compounding means earning interest on top of previous interest.",
        "The earlier you start saving, the bigger your snowball grows!",
      ],
    },
    quizQuestions: [
      {
        question: "What is compounding interest?",
        options: [
          "Earning interest on both your savings and your past interest",
          "A fee you pay at the store",
          "Hiding cash under your mattress",
        ],
        correctIndex: 0,
        explanation:
          "Compounding makes your savings grow faster each cycle because past interest earns new interest!",
      },
    ],
    xpReward: 75,
    defaultMoneyReward: "1.00",
    badgeCode: "COMPOUND_WIZARD",
    orderIndex: 4,
  },
  {
    title: "Spotting Online Scams & Phishing",
    slug: "spotting-online-scams-and-phishing",
    topic: "SCAMS",
    ageGroup: "AGE_14_17",
    summary:
      "Protect your wallet! Learn how scammers use fake giveaways, urgent messages, and wrong emails to trick people.",
    content: {
      story:
        "If someone online promises 'Send me $10 and I will send you $100 back' or asks for your login PIN, it is 100% a scam! Always verify recipient email addresses before sending money.",
      keyTakeaways: [
        "Never share your account PIN or password with anyone.",
        "If an offer sounds too good to be true, it is a scam.",
        "Always double-check recipient PayPal emails before requesting a transfer.",
      ],
    },
    quizQuestions: [
      {
        question:
          "A message says: 'You won a free console! Send $5 shipping to claim-prize@sketchy.com right now!' What should you do?",
        options: [
          "Send the $5 immediately",
          "Ignore/report it and tell a parent—real prizes don't ask you to send money",
          "Reply with your PIN code",
        ],
        correctIndex: 1,
        explanation:
          "Scammers create fake urgency and ask for upfront payments. Never send money to unknown emails!",
      },
      {
        question:
          "Why is it critical to double-check a recipient's PayPal email before sending money?",
        options: [
          "Because a typo could send real money to a stranger and cannot be automatically reversed",
          "It doesn't matter at all",
          "PayPal guesses who you meant",
        ],
        correctIndex: 0,
        explanation:
          "Digital transfers to an active wrong email go straight to that account!",
      },
    ],
    xpReward: 100,
    defaultMoneyReward: "1.50",
    badgeCode: "SCAM_SHIELD",
    orderIndex: 5,
  },
];

/**
 * Ensures built-in financial education lessons and badges exist in the database (FR-9.1, FR-9.2).
 */
export async function ensureLessonsAndBadgesSeeded() {
  const count = await prisma.lesson.count();
  if (count > 0) return;

  for (const badge of DEFAULT_BADGES) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      update: {},
      create: badge,
    });
  }

  for (const lesson of DEFAULT_LESSONS) {
    await prisma.lesson.upsert({
      where: { slug: lesson.slug },
      update: {},
      create: {
        title: lesson.title,
        slug: lesson.slug,
        topic: lesson.topic,
        ageGroup: lesson.ageGroup,
        summary: lesson.summary,
        content: lesson.content as Prisma.InputJsonValue,
        quizQuestions: lesson.quizQuestions as unknown as Prisma.InputJsonValue,
        xpReward: lesson.xpReward,
        defaultMoneyReward: new Prisma.Decimal(lesson.defaultMoneyReward),
        badgeCode: lesson.badgeCode,
        orderIndex: lesson.orderIndex,
        isActive: true,
      },
    });
  }
}
