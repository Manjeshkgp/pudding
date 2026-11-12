// Runs real local HTTP requests through curl against isolated Sandbox fixtures.
// Usage: node --env-file=.env scripts/check-demo-apis.mjs [--paypal] [--keep]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Checks must target localhost.",
);
assert.notEqual(process.env.NODE_ENV, "production");
const pay = process.argv.includes("--paypal");
if (pay) assert.equal(process.env.PAYPAL_ENV, "sandbox");
const db = new PrismaClient();
const temp = await mkdtemp(join(tmpdir(), "pudding-api-check-"));
const families = [];
const stamp = Date.now();
let checks = 0;
let sandboxOrderId = null;
const key = () => randomUUID();
async function jar(name) {
  const file = join(temp, name);
  await writeFile(file, "");
  return file;
}
const parent = await jar("parent"),
  childJar = await jar("child"),
  other = await jar("other"),
  co = await jar("co"),
  anonymous = await jar("anonymous");
async function call(cookie, method, path, body, expected = 200) {
  const args = [
    "--silent",
    "--show-error",
    "--max-time",
    "120",
    "--cookie",
    cookie,
    "--cookie-jar",
    cookie,
    "--write-out",
    "\n%{http_code}",
    "-X",
    method,
    base + path,
  ];
  if (body instanceof URLSearchParams) {
    for (const [name, value] of body) args.push("--form", `${name}=${value}`);
  } else if (body !== undefined) {
    args.push("-H", "Content-Type: application/json", "--data-binary", "@-");
  }
  const output = await new Promise((resolve, reject) => {
    const proc = spawn("curl", args);
    let out = "",
      err = "";
    proc.stdout.on("data", (b) => (out += b));
    proc.stderr.on("data", (b) => (err += b));
    proc.on("error", reject);
    proc.on("close", (c) =>
      c
        ? reject(new Error(`curl failed (${c}): ${err.slice(0, 150)}`))
        : resolve(out),
    );
    proc.stdin.end(body === undefined || body instanceof URLSearchParams ? undefined : JSON.stringify(body));
  });
  const at = output.lastIndexOf("\n");
  const status = Number(output.slice(at + 1));
  let json;
  try {
    json = JSON.parse(output.slice(0, at));
  } catch {
    throw new Error(`${method} ${path} did not return JSON (HTTP ${status})`);
  }
  assert(
    (Array.isArray(expected) ? expected : [expected]).includes(status),
    `${method} ${path}: HTTP ${status}, code ${json.error?.code || "none"}`,
  );
  checks++;
  return json.data;
}
async function signup(cookie, suffix) {
  const email = `pudding-check-${stamp}-${suffix}@example.test`,
    password = "PuddingCheck!123";
  const start = await call(cookie, "POST", "/api/auth/parent/signup/start", {
    email,
  });
  assert.match(start.devOtpCode, /^\d{6}$/);
  await call(
    cookie,
    "POST",
    "/api/auth/parent/signup/verify",
    { code: "000000" },
    400,
  );
  await call(cookie, "POST", "/api/auth/parent/signup/verify", {
    code: start.devOtpCode,
  });
  await call(cookie, "POST", "/api/auth/parent/signup/password", { password });
  await call(cookie, "POST", "/api/auth/parent/signup/notifications", {});
  await call(cookie, "POST", "/api/auth/parent/signup/security-questions", {
    questionKey: "school",
    questionText: "The school you attended first",
    answer: "Maple",
    slot: 0,
  });
  await call(cookie, "POST", "/api/auth/parent/signup/security-questions", {
    questionKey: "pet",
    questionText: "The name of your first pet",
    answer: "Clover",
    slot: 1,
  });
  const progress = await call(cookie, "GET", "/api/auth/parent/signup/status");
  assert.equal(progress.questions.length, 2);
  assert.equal(progress.passwordSaved, true);
  assert(!JSON.stringify(progress).includes("answerHash"));
  await call(cookie, "POST", "/api/auth/parent/signup/security-questions", {
    questionKey: "school",
    questionText: "The school you attended first",
    slot: 0,
  });
  const result = await call(
    cookie,
    "POST",
    "/api/auth/parent/signup/complete",
    { name: "Integration Parent", avatar: "avatar-1" },
    201,
  );
  families.push(result.family.id);
  return { email, password, id: result.user.id, familyId: result.family.id };
}
try {
  await call(anonymous, "GET", "/api/purchases", undefined, 401);
  const fixture = await signup(parent, "main");
  const second = await signup(other, "other");
  await call(parent, "POST", "/api/onboarding/subscription", { action: "start", plan: "monthly" }, 409);
  await call(parent, "PATCH", "/api/auth/me", {
    name: "Integration Parent Updated",
    avatar: "avatar-2",
  });
  const me = await call(parent, "GET", "/api/auth/me");
  assert.equal(me.user.avatar, "avatar-2");
  assert.equal(me.user.pinSet, false);
  assert(!JSON.stringify(me).includes("passwordHash"));
  await call(parent, "POST", "/api/auth/parent/pin", { newPin: "123456" });
  for (let n = 0; n < 5; n++)
    await call(
      parent,
      "POST",
      "/api/family/topups",
      { amount: 1, pin: "000000", idempotencyKey: key() },
      n === 4 ? 423 : 403,
    );
  await call(
    parent,
    "POST",
    "/api/family/topups",
    { amount: 1, pin: "123456", idempotencyKey: key() },
    423,
  );
  assert.equal(
    await db.familyTopUp.count({ where: { familyId: fixture.familyId } }),
    0,
  );
  await call(parent, "POST", "/api/auth/parent/pin", {
    newPin: "123456",
    password: fixture.password,
  });
  const firstKey = key();
  await call(
    parent,
    "POST",
    "/api/family/topups",
    { amount: 4000, pin: "123456", idempotencyKey: firstKey },
    201,
  );
  await call(parent, "POST", "/api/family/topups", {
    amount: 4000,
    pin: "123456",
    idempotencyKey: firstKey,
  });
  await call(
    parent,
    "POST",
    "/api/family/topups",
    { amount: 3000, pin: "123456", idempotencyKey: firstKey },
    409,
  );
  await call(other, "POST", "/api/auth/parent/pin", { newPin: "123456" });
  await call(
    other,
    "POST",
    "/api/family/topups",
    { amount: 4000, pin: "123456", idempotencyKey: firstKey },
    409,
  );
  const concurrentKey = key();
  const [a, b] = await Promise.all([
    call(
      parent,
      "POST",
      "/api/family/topups",
      { amount: 500, pin: "123456", idempotencyKey: concurrentKey },
      [200, 201],
    ),
    call(
      parent,
      "POST",
      "/api/family/topups",
      { amount: 500, pin: "123456", idempotencyKey: concurrentKey },
      [200, 201],
    ),
  ]);
  assert.equal(a.topUp.id, b.topUp.id);
  assert.equal((await call(parent, "GET", "/api/family/topups")).limit, "4500");
  const added = await call(
    parent,
    "POST",
    "/api/children",
    {
      firstName: "Integration",
      lastName: "Kid",
      dateOfBirth: "2015-06-15",
      avatar: "avatar-1",
      consentAccepted: true,
    },
    201,
  );
  const child = added.child;
  const onboarding = await call(parent, "POST", "/api/onboarding/children/complete", {});
  assert.equal(onboarding.nextRoute, "/onboarding/plan");
  await call(parent, "GET", "/api/auth/paypal/connect?mode=json", undefined, 403);
  await call(parent, "POST", "/api/auth/paypal/vault/setup", {}, 403);
  assert.equal(
    (await call(parent, "POST", "/api/onboarding/subscription", {
      action: "confirm",
      subscriptionId: "I-UNTRUSTED",
    })).status,
    null,
  );
  assert.equal(child.pinSet, false);
  assert.equal(
    (await call(parent, "GET", `/api/spending-rules/${child.id}`)).rule
      .dailyLimit,
    "20",
  );
  await call(
    childJar,
    "POST",
    "/api/auth/child/login",
    { username: child.username, pin: "123456" },
    403,
  );
  const source = pay
    ? await db.user.findFirst({
        where: {
          paypalVaultId: { not: null },
          role: "PRIMARY_PARENT",
          NOT: { email: { startsWith: "pudding-check-" } },
        },
        orderBy: { updatedAt: "desc" },
        select: { paypalVaultId: true },
      })
    : { paypalVaultId: "local-smoke-wallet" };
  assert(source?.paypalVaultId, "A saved Sandbox wallet is required for --paypal.");
  // Normal smoke checks verify wallet-gated activation with a local fixture.
  await db.familySubscription.create({
    data: {
      familyId: fixture.familyId,
      planKey: "monthly",
      paypalPlanId: "P-LOCALSMOKE",
      paypalSubscriptionId: "I-LOCALSMOKE",
      status: "ACTIVE",
    },
  });
  await db.user.update({
    where: { id: fixture.id },
    data: { paypalVaultId: source.paypalVaultId, paypalIsVerified: true },
  });
  assert.deepEqual(
    await call(parent, "POST", "/api/auth/paypal/vault/setup", {}),
    { vaultConnected: true },
  );
  const activated = await call(
    parent,
    "POST",
    `/api/children/${child.id}/activate`,
    {
      parentPin: "123456",
      dailyLimit: 0,
      weeklyLimit: null,
      maxPerTransaction: null,
      inStoreEnabled: true,
      onlineEnabled: true,
      ageBlockEnabled: true,
    },
    201,
  );
  assert.match(activated.pin, /^\d{6}$/);
  assert.equal(activated.username, child.username);
  await call(childJar, "POST", "/api/auth/child/login", {
    username: activated.username,
    pin: activated.pin,
  });
  await call(childJar, "GET", "/api/family/topups", undefined, 403);
  await call(childJar, "GET", "/api/family/summary", undefined, 403);
  await call(other, "GET", `/api/children/${child.id}`, undefined, 403);
  await call(
    other,
    "POST",
    `/api/children/${child.id}/reset-pin`,
    { newPin: "111111", parentPin: "123456" },
    404,
  );
  await call(parent, "POST", `/api/wallets/${child.id}/transfer`, {
    mode: "FAMILY_TO_CHILD",
    amount: 500,
    targetBucket: "SPEND",
    idempotencyKey: key(),
  });
  const home = await call(childJar, "GET", "/api/child/home");
  assert.equal(home.profile.id, child.id);
  assert.equal(home.wallet.spendBalance, "500");
  const chore = await call(
    parent,
    "POST",
    "/api/chores",
    {
      title: "Integration tidy up",
      rewardAmount: 2,
      recurrence: "DAILY",
      assigneeIds: [child.id],
    },
    201,
  );
  const choreId = chore.chore?.id || chore.id;
  const once = await call(parent, "POST", "/api/chores", {
    title: "Integration one-time task",
    rewardAmount: 0,
    recurrence: "ONCE",
    assigneeIds: [child.id],
  }, 201);
  const taskPreview = await call(childJar, "GET", "/api/child/home");
  assert(taskPreview.chores.some((task) => task.id === once.id));
  await call(parent, "DELETE", `/api/chores/${once.id}`);
  assert(!(await call(childJar, "GET", "/api/child/home")).chores.some((task) => task.id === once.id));
  const { periodStart } = await call(childJar, "GET", `/api/chores/${choreId}`);
  await call(childJar, "POST", `/api/chores/${choreId}/submit`, { periodStart }, 400);
  const photoPath = join(temp, "task.png");
  await writeFile(photoPath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM9sAAAAASUVORK5CYII=",
    "base64",
  ));
  const { evidence } = await call(childJar, "POST", `/api/chores/${choreId}/evidence`,
    new URLSearchParams({ file: `@${photoPath};type=image/png`, periodStart }), 201);
  const taskProof = { periodStart, afterEvidenceId: evidence.id };
  const submission = await call(
    childJar,
    "POST",
    `/api/chores/${choreId}/submit`,
    taskProof,
    201,
  );
  const submissionPath = `/api/chore-submissions/${submission.id}`;
  const detail = await call(parent, "GET", submissionPath);
  assert.equal(detail.id, submission.id);
  assert.equal(detail.chore.title, "Integration tidy up");
  assert.equal(detail.afterEvidenceId, evidence.id);
  await call(childJar, "GET", submissionPath, undefined, 403);
  await call(other, "GET", submissionPath, undefined, 404);
  const inbox = await call(parent, "GET", "/api/notifications");
  assert.equal(
    inbox.items.find((item) => item.metadata?.submissionId === submission.id)?.metadata.href,
    `/approvals/tasks/${submission.id}`,
  );
  await call(childJar, "POST", `/api/chores/${choreId}/submit`, taskProof, 409);
  assert(!(await call(childJar, "GET", "/api/child/home")).chores.some((task) => task.id === choreId));
  await call(parent, "POST", `/api/chore-submissions/${submission.id}/review`, {
    decision: "APPROVE",
  });
  assert.equal((await call(parent, "GET", submissionPath)).status, "APPROVED");
  await call(parent, "POST", `/api/chore-submissions/${submission.id}/review`, {
    decision: "APPROVE",
    idempotencyKey: key(),
  });
  assert.equal(
    (await db.child.findUniqueOrThrow({ where: { id: child.id } })).xp,
    25,
  );
  assert(
    (
      await db.wallet.findUniqueOrThrow({ where: { childId: child.id } })
    ).spendBalance.equals("501.40"),
  );
  await call(childJar, "POST", `/api/chores/${choreId}/submit`, taskProof, 409);
  const transferPath = `/api/wallets/${child.id}/transfer`;
  await call(parent, "POST", transferPath, {
    mode: "FAMILY_TO_CHILD",
    amount: 10,
    targetBucket: "SAVE",
    idempotencyKey: key(),
  });
  await call(
    childJar,
    "POST",
    transferPath,
    {
      mode: "BETWEEN_BUCKETS",
      amount: 2,
      fromBucket: "SPEND",
      toBucket: "SAVE",
      idempotencyKey: key(),
    },
    400,
  );
  const conversion = {
    mode: "SAVE_TO_SPEND",
    amount: 2.25,
    idempotencyKey: key(),
  };
  await call(parent, "POST", transferPath, conversion, 403);
  await call(
    childJar,
    "POST",
    transferPath,
    { ...conversion, fromBucket: "SPEND", toBucket: "SAVE" },
    400,
  );
  await call(childJar, "POST", transferPath, { ...conversion, amount: 0.001 }, 400);
  await call(childJar, "POST", transferPath, { ...conversion, amount: 20 }, 400);
  const converted = await call(childJar, "POST", transferPath, conversion);
  assert.equal(converted.wallet.spendBalance, "503.65");
  assert.equal(converted.wallet.saveBalance, "8.35");
  const replay = await call(childJar, "POST", transferPath, conversion);
  assert.equal(replay.idempotentReplay, true);
  assert.deepEqual(replay.wallet, converted.wallet);
  await call(childJar, "POST", transferPath, { ...conversion, amount: 3 }, 409);
  assert.equal(
    await db.ledgerEntry.count({
      where: { childId: child.id, type: "BUCKET_TRANSFER" },
    }),
    2,
  );
  const createdGoal = await call(
    childJar,
    "POST",
    "/api/goals",
    { name: "Integration bicycle", targetAmount: 50 },
    201,
  );
  const goalId = createdGoal.goal?.id || createdGoal.id;
  const depositKey = key();
  await call(childJar, "POST", `/api/goals/${goalId}/deposit`, {
    source: "SAVE_BUCKET",
    amount: 5,
    idempotencyKey: depositKey,
  });
  await call(childJar, "POST", `/api/goals/${goalId}/deposit`, {
    source: "SAVE_BUCKET",
    amount: 5,
    idempotencyKey: depositKey,
  });
  assert.equal(
    (await call(childJar, "GET", `/api/goals/${goalId}`)).currentAmount,
    "5",
  );
  const contribution = {
    source: "PARENT_CONTRIBUTION",
    amount: 3,
    idempotencyKey: key(),
  };
  await call(childJar, "POST", `/api/goals/${goalId}/deposit`, contribution, 403);
  await call(parent, "POST", `/api/goals/${goalId}/deposit`, contribution);
  await call(parent, "POST", `/api/goals/${goalId}/deposit`, contribution);
  assert.equal(
    (await call(childJar, "GET", `/api/goals/${goalId}`)).currentAmount,
    "8",
  );
  const withdrawalKey = key();
  await call(childJar, "POST", `/api/goals/${goalId}/withdraw`, {
    destinationBucket: "SAVE",
    idempotencyKey: withdrawalKey,
  });
  await call(childJar, "POST", `/api/goals/${goalId}/withdraw`, {
    destinationBucket: "SAVE",
    idempotencyKey: withdrawalKey,
  });
  const invoiceKey = key();
  const invoice = (
    await call(
      childJar,
      "POST",
      "/api/purchases",
      { idempotencyKey: invoiceKey },
      201,
    )
  ).purchase;
  assert.equal(invoice.status, "CREATED");
  assert.equal(invoice.paidAt, null);
  assert(invoice.items.length > 0);
  assert.equal(
    (
      await call(
        childJar,
        "POST",
        "/api/purchases",
        { idempotencyKey: invoiceKey },
        201,
      )
    ).purchase.id,
    invoice.id,
  );
  await call(other, "GET", `/api/purchases/${invoice.id}`, undefined, 404);
  const parentBill = await call(parent, "GET", `/api/purchases/${invoice.id}`);
  assert.equal(parentBill.purchase.child.name, child.name);
  assert.equal(parentBill.review.canApprove, true);
  assert.equal(parentBill.review.pinSet, true);
  const childBill = await call(childJar, "GET", `/api/purchases/${invoice.id}`);
  assert.equal(childBill.review, undefined);
  for (const viewer of [parent, childJar]) {
    const activity = await call(viewer, "GET", "/api/purchases");
    assert(!activity.items.some((item) => item.id === invoice.id));
  }
  await call(parent, "POST", `/api/purchases/${invoice.id}/decision`, {}, 403);
  await call(
    childJar,
    "POST",
    `/api/purchases/${invoice.id}/review`,
    { action: "APPROVE" },
    403,
  );
  const decision = await call(
    childJar,
    "POST",
    `/api/purchases/${invoice.id}/decision`,
    {},
  );
  assert.equal(decision.purchase.status, "WAITING_PARENT");
  assert.equal(decision.purchase.aiDecision, "PARENT");
  for (const viewer of [parent, childJar]) {
    const activity = await call(viewer, "GET", "/api/purchases");
    assert(activity.items.some((item) => item.id === invoice.id));
  }
  const requestNotification = (await call(parent, "GET", "/api/notifications"))
    .notifications.find((item) => item.metadata?.purchaseId === invoice.id);
  assert.equal(requestNotification?.metadata.href, `/approve/${invoice.id}`);
  await call(parent, "POST", `/api/purchases/${invoice.id}/pay`, {}, 409);
  await call(parent, "POST", `/api/purchases/${invoice.id}/review`, {
    action: "APPROVE",
  }, 400);
  await call(parent, "POST", `/api/purchases/${invoice.id}/review`, {
    action: "APPROVE",
    pin: "000000",
  }, 403);
  // Previously blocked bills must still appear in Approvals and accept a parent decision.
  await db.purchase.update({
    where: { id: invoice.id },
    data: { status: "AI_BLOCKED", aiDecision: "BLOCK" },
  });
  const approvals = await call(parent, "GET", "/api/purchases?view=approvals");
  assert(approvals.items.some((item) => item.id === invoice.id));
  await call(childJar, "POST", `/api/purchases/${invoice.id}/pay`, {}, 409);
  await call(parent, "POST", `/api/purchases/${invoice.id}/review`, {
    action: "DECLINE",
  });
  const hasDecline = (item) =>
    item.title === "Purchase declined" && item.metadata?.purchaseId === invoice.id;
  assert((await call(childJar, "GET", "/api/notifications")).items.some(hasDecline));
  const parentInbox = await call(parent, "GET", "/api/notifications");
  assert(!parentInbox.items.some(hasDecline));
  assert.equal(await db.notification.count({
    where: { userId: fixture.id, type: "PURCHASE_UPDATE", title: "Purchase declined" },
  }), 0);
  await db.notification.create({
    data: {
      familyId: fixture.familyId,
      userId: fixture.id,
      type: "PURCHASE_UPDATE",
      title: "Purchase declined",
      message: "Historical outcome.",
      metadata: { purchaseId: invoice.id },
    },
  });
  const afterHistoricalDecline = await call(parent, "GET", "/api/notifications");
  assert(!afterHistoricalDecline.items.some(hasDecline));
  assert.equal(afterHistoricalDecline.unreadCount, parentInbox.unreadCount);
  assert.equal(
    (await call(parent, "GET", "/api/family/summary")).unreadNotifications,
    parentInbox.unreadCount,
  );
  await call(childJar, "POST", `/api/purchases/${invoice.id}/pay`, {}, 409);
  if (!process.env.GEMINI_API_KEY) {
    await call(parent, "PUT", `/api/spending-rules/${child.id}`, {
      dailyLimit: 20,
    });
    const noAI = (
      await call(
        childJar,
        "POST",
        "/api/purchases",
        { idempotencyKey: key() },
        201,
      )
    ).purchase;
    await db.purchase.update({
      where: { id: noAI.id },
      data: {
        amount: "1.00",
        items: [
          {
            name: "Test notebook",
            category: "School",
            unitPrice: "1.00",
            quantity: 1,
          },
        ],
      },
    });
    const fallback = (
      await call(childJar, "POST", `/api/purchases/${noAI.id}/decision`, {})
    ).purchase;
    assert.equal(fallback.status, "WAITING_PARENT");
    assert.equal(fallback.aiDecision, "UNAVAILABLE");
    await call(parent, "POST", `/api/purchases/${noAI.id}/review`, {
      action: "DECLINE",
    });
    await call(parent, "PUT", `/api/spending-rules/${child.id}`, {
      dailyLimit: 0,
    });
  }
  const payment = (
    await call(
      childJar,
      "POST",
      "/api/purchases",
      { idempotencyKey: key() },
      201,
    )
  ).purchase;
  await db.purchase.update({
    where: { id: payment.id },
    data: {
      amount: "1.00",
      items: [
        {
          name: "Sandbox test notebook",
          category: "School",
          unitPrice: "1.00",
          quantity: 1,
        },
      ],
    },
  });
  await call(childJar, "POST", `/api/purchases/${payment.id}/decision`, {});
  await db.family.update({
    where: { id: fixture.familyId },
    data: { spentTotal: "4500" },
  });
  await call(
    parent,
    "POST",
    `/api/purchases/${payment.id}/review`,
    { action: "APPROVE", pin: "123456" },
    409,
  );
  assert.equal(
    (await db.purchase.findUniqueOrThrow({ where: { id: payment.id } }))
      .paypalOrderId,
    null,
  );
  await db.family.update({
    where: { id: fixture.familyId },
    data: { spentTotal: "0" },
  });
  const before = await db.wallet.findUniqueOrThrow({
    where: { childId: child.id },
  });
  await db.wallet.update({
    where: { childId: child.id },
    data: { spendBalance: 0 },
  });
  const confirmation = await call(
    parent,
    "POST",
    `/api/purchases/${payment.id}/review`,
    { action: "APPROVE", pin: "123456" },
  );
  assert.deepEqual(confirmation.allowanceConfirmation, {
    amount: "1.00",
    currency: "USD",
  });
  assert.equal((await db.purchase.findUniqueOrThrow({ where: { id: payment.id } })).paypalOrderId, null);
  await db.wallet.update({
    where: { childId: child.id },
    data: { spendBalance: before.spendBalance },
  });
  if (pay) {
    const sibling = (
      await call(
        parent,
        "POST",
        "/api/children",
        {
          firstName: "Integration",
          lastName: "Sibling",
          dateOfBirth: "2014-06-15",
          avatar: "avatar-2",
          consentAccepted: true,
        },
        201,
      )
    ).child;
    const siblingCredentials = await call(
      parent,
      "POST",
      `/api/children/${sibling.id}/activate`,
      {
        parentPin: "123456",
        dailyLimit: 0,
        weeklyLimit: null,
        maxPerTransaction: null,
        inStoreEnabled: true,
        onlineEnabled: true,
        ageBlockEnabled: true,
      },
      201,
    );
    await call(parent, "POST", `/api/wallets/${sibling.id}/transfer`, {
      mode: "FAMILY_TO_CHILD",
      amount: 5,
      targetBucket: "SPEND",
      idempotencyKey: key(),
    });
    const siblingJar = await jar("sibling");
    await call(siblingJar, "POST", "/api/auth/child/login", {
      username: siblingCredentials.username,
      pin: siblingCredentials.pin,
    });
    const siblingInvoice = (
      await call(
        siblingJar,
        "POST",
        "/api/purchases",
        { idempotencyKey: key() },
        201,
      )
    ).purchase;
    await db.purchase.update({
      where: { id: siblingInvoice.id },
      data: {
        amount: "1.00",
        items: [
          {
            name: "Sandbox test pencil",
            category: "School",
            unitPrice: "1.00",
            quantity: 1,
          },
        ],
      },
    });
    await call(
      siblingJar,
      "POST",
      `/api/purchases/${siblingInvoice.id}/decision`,
      {},
    );
    await db.family.update({
      where: { id: fixture.familyId },
      data: { spendingLimit: 1 },
    });
    const results = await Promise.all(
      [payment.id, siblingInvoice.id].map((id) =>
        call(
          parent,
          "POST",
          `/api/purchases/${id}/review`,
          { action: "APPROVE", pin: "123456" },
          [200, 409],
        ),
      ),
    );
    const paid = results.find((r) => r?.purchase.status === "PAID")?.purchase;
    assert(
      paid,
      "Exactly one child's 1 USD purchase should complete within the shared 1 USD capacity.",
    );
    assert.equal(
      results.filter((r) => r?.purchase.status === "PAID").length,
      1,
    );
    sandboxOrderId = paid.paypalOrderId;
    await call(parent, "POST", `/api/purchases/${paid.id}/review`, {
      action: "APPROVE",
      pin: "123456",
    });
    const [family, wallets, ledgerCount] = await Promise.all([
      db.family.findUniqueOrThrow({ where: { id: fixture.familyId } }),
      db.wallet.findMany({
        where: { childId: { in: [child.id, sibling.id] } },
      }),
      db.ledgerEntry.count({
        where: {
          familyId: fixture.familyId,
          idempotencyKey: { startsWith: "purchase-paid:" },
        },
      }),
    ]);
    assert.equal(family.spentTotal.toString(), "1");
    assert.equal(family.reservedTotal.toString(), "0");
    assert(wallets.every((w) => w.purchaseReservedBalance.equals(0)));
    assert.equal(ledgerCount, 1);
    const sum = wallets.reduce(
      (total, w) => total.plus(w.spendBalance),
      new before.spendBalance.constructor(0),
    );
    assert(sum.equals(before.spendBalance.plus(5).minus(1)));
    await db.family.update({
      where: { id: fixture.familyId },
      data: { spendingLimit: 4500 },
    });
  }

  const stale = (
    await call(
      childJar,
      "POST",
      "/api/purchases",
      { idempotencyKey: key() },
      201,
    )
  ).purchase;
  await db.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: stale.id },
      data: {
        amount: 1,
        status: "PROCESSING",
        aiDecision: "APPROVE",
        processingAt: new Date(Date.now() - 600000),
        paymentStartedAt: new Date(Date.now() - 960000),
        paymentAttempt: 1,
        payerUserId: fixture.id,
      },
    });
    await tx.family.update({
      where: { id: fixture.familyId },
      data: { reservedTotal: { increment: 1 } },
    });
    await tx.wallet.update({
      where: { childId: child.id },
      data: { purchaseReservedBalance: { increment: 1 } },
    });
  });
  const held = (
    await call(childJar, "POST", `/api/purchases/${stale.id}/pay`, {})
  ).purchase;
  assert.equal(held.status, "PROCESSING");
  assert.match(held.decisionReason, /manual confirmation/);
  assert.equal(held.paypalOrderId, null);
  const protectedGoal = await call(
    childJar,
    "POST",
    "/api/goals",
    { name: "Protected savings", targetAmount: 20 },
    201,
  );
  const protectedGoalId = protectedGoal.goal?.id || protectedGoal.id;
  const gross = (
    await db.wallet.findUniqueOrThrow({ where: { childId: child.id } })
  ).spendBalance.toNumber();
  await call(
    childJar,
    "POST",
    `/api/goals/${protectedGoalId}/deposit`,
    { source: "SPEND_BUCKET", amount: gross, idempotencyKey: key() },
    400,
  );
  await db.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: stale.id },
      data: { status: "PAYMENT_FAILED" },
    });
    await tx.family.update({
      where: { id: fixture.familyId },
      data: { reservedTotal: { decrement: 1 } },
    });
    await tx.wallet.update({
      where: { childId: child.id },
      data: { purchaseReservedBalance: { decrement: 1 } },
    });
  });
  await call(parent, "POST", `/api/children/${child.id}/reset-pin`, {
    newPin: "654321",
    parentPin: "123456",
  });
  await call(childJar, "POST", "/api/auth/logout", {});
  await call(
    childJar,
    "POST",
    "/api/auth/child/login",
    { username: activated.username, pin: activated.pin },
    401,
  );
  await call(childJar, "POST", "/api/auth/child/login", {
    username: activated.username,
    pin: "654321",
  });
  const invite = await call(
    parent,
    "POST",
    "/api/family/co-parents",
    {
      name: "Integration Co Parent",
      email: `pudding-check-${stamp}-co@example.test`,
      permissionLevel: "LIMITED",
    },
    201,
  );
  assert.equal(invite.delivery.delivered, false);
  await call(
    anonymous,
    "GET",
    `/api/family/co-parents/accept?token=${invite.invite.inviteToken}`,
  );
  await call(
    co,
    "POST",
    "/api/family/co-parents/accept",
    { inviteToken: invite.invite.inviteToken, password: "PuddingCo!123" },
    201,
  );
  await call(
    co,
    "POST",
    "/api/family/topups",
    { amount: 1, pin: "123456", idempotencyKey: key() },
    403,
  );
  const coList = await call(co, "GET", "/api/family/co-parents");
  assert(coList.invites.every((i) => !i.inviteToken));
  await db.notification.create({
    data: {
      familyId: fixture.familyId,
      userId: fixture.id,
      title: "Private parent test",
      message: "Private test",
      type: "CHECK",
    },
  });
  assert(
    (await call(co, "GET", "/api/notifications")).notifications.every(
      (n) => n.title !== "Private parent test",
    ),
  );
  await call(parent, "PATCH", "/api/notifications", { markAllRead: true });
  assert.equal(
    (await call(parent, "GET", "/api/notifications")).unreadCount,
    0,
  );
  await call(parent, "PUT", "/api/notifications/preferences", {
    pushEnabled: false,
    emailEnabled: false,
  });
  assert.equal(
    (await call(parent, "GET", "/api/notifications/preferences")).preferences
      .pushEnabled,
    false,
  );
  await call(
    parent,
    "POST",
    "/api/support",
    {
      subject: "Integration request",
      message: "This is an isolated automated API integration check.",
    },
    201,
  );
  assert.equal((await call(parent, "GET", "/api/support")).tickets.length, 1);
  assert.equal((await call(co, "GET", "/api/support")).tickets.length, 0);
  const otp = await call(anonymous, "POST", "/api/auth/verify/send-code", {
    target: fixture.email,
    purpose: "PASSWORD_RESET",
  });
  await call(anonymous, "POST", "/api/auth/password/reset", {
    email: fixture.email,
    otpCode: otp.devOtpCode,
    newPassword: "ChangedPudding!123",
  });
  await call(
    parent,
    "POST",
    "/api/auth/parent/login",
    { emailOrPhone: fixture.email, password: fixture.password },
    401,
  );
  await call(parent, "POST", "/api/auth/parent/login", {
    emailOrPhone: fixture.email,
    password: "ChangedPudding!123",
  });
  await call(parent, "POST", "/api/auth/logout", {});
  await call(parent, "GET", "/api/auth/me", undefined, 401);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        httpChecks: checks,
        sandboxCharge: pay
          ? "1.00 USD COMPLETED; retry produced one ledger debit"
          : "not requested",
        sandboxOrderId,
      },
      null,
      2,
    ),
  );
} finally {
  if (!process.argv.includes("--keep")) {
    for (const familyId of families.reverse()) {
      await db.purchase.deleteMany({ where: { familyId } });
      await db.family
        .delete({ where: { id: familyId } })
        .catch(() => undefined);
    }
  } else console.log("Fixtures retained:", families.join(", "));
  await db.$disconnect();
  await rm(temp, { recursive: true, force: true });
}
