import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { logger } from "./logger";

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code = "API_ERROR",
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function apiSuccess<T>(data: T, status = 200, message?: string) {
  return NextResponse.json(
    {
      success: true,
      ...(message ? { message } : {}),
      data,
    },
    { status }
  );
}

export function apiError(
  statusCode: number,
  message: string,
  code = "BAD_REQUEST",
  details?: unknown
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status: statusCode }
  );
}

export async function validateBody<S extends ZodSchema>(
  req: NextRequest,
  schema: S
): Promise<S["_output"]> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON request body", "INVALID_JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "Validation failed",
      "VALIDATION_ERROR",
      parsed.error.flatten().fieldErrors
    );
  }
  return parsed.data;
}

export function handleRouteError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      logger.error("api.request_failed", {
        httpStatus: error.statusCode,
        errorCode: error.code,
        errorName: error.name,
        details: error.details,
      });
    }
    return apiError(
      error.statusCode,
      error.message,
      error.code,
      error.details
    );
  }

  if (error instanceof ZodError) {
    return apiError(
      400,
      "Validation failed",
      "VALIDATION_ERROR",
      error.flatten().fieldErrors
    );
  }

  logger.error(
    "api.unhandled_error",
    { errorCode: "INTERNAL_SERVER_ERROR" },
    error
  );
  return apiError(
    500,
    "An unexpected server error occurred",
    "INTERNAL_SERVER_ERROR"
  );
}
