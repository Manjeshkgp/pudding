import { NextRequest } from "next/server";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireAuth } from "@/lib/auth-guard";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * POST /api/uploads/photo
 * Uploads chore proof photos (FR-5.3), savings goal images (FR-6.1), or spend request product images (FR-7.1)
 * directly to Cloudinary under the configured folder.
 * Supports multipart/form-data (`file` + optional `purpose`) or JSON (`{ base64, mimeType, purpose }`).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const maxMb = Number(process.env.MAX_UPLOAD_FILE_SIZE_MB || "5");
    const maxBytes = maxMb * 1024 * 1024;

    const contentType = req.headers.get("content-type") || "";
    let fileBuffer: Buffer;
    let mimeType = "image/jpeg";
    let purpose = "general";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const purposeField = formData.get("purpose");

      if (purposeField && typeof purposeField === "string") {
        purpose = purposeField.replace(/[^a-zA-Z0-9_-]/g, "");
      }

      if (!file || !(file instanceof File)) {
        throw new ApiError(
          400,
          "Missing 'file' field in multipart/form-data request",
          "FILE_REQUIRED"
        );
      }

      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
        throw new ApiError(
          400,
          `Unsupported image format (${file.type}). Allowed: JPEG, PNG, WEBP, GIF`,
          "UNSUPPORTED_MEDIA_TYPE"
        );
      }

      if (file.size > maxBytes) {
        throw new ApiError(
          413,
          `Image exceeds the maximum file size of ${maxMb}MB`,
          "FILE_TOO_LARGE"
        );
      }

      mimeType = file.type;
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      const body = (await req.json()) as {
        base64?: string;
        mimeType?: string;
        purpose?: string;
      };

      if (!body.base64) {
        throw new ApiError(
          400,
          "Provide either multipart/form-data 'file' or JSON 'base64' image data",
          "FILE_REQUIRED"
        );
      }

      if (body.purpose) {
        purpose = body.purpose.replace(/[^a-zA-Z0-9_-]/g, "");
      }

      const rawBase64 = body.base64.includes(",")
        ? body.base64.split(",")[1]
        : body.base64;

      if (body.mimeType && ALLOWED_IMAGE_MIME_TYPES.has(body.mimeType)) {
        mimeType = body.mimeType;
      }

      fileBuffer = Buffer.from(rawBase64, "base64");
      if (fileBuffer.byteLength > maxBytes) {
        throw new ApiError(
          413,
          `Image exceeds the maximum file size of ${maxMb}MB`,
          "FILE_TOO_LARGE"
        );
      }
    }

    const uploaded = await uploadImageToCloudinary(
      fileBuffer,
      mimeType,
      purpose || "proofs"
    );

    return apiSuccess(uploaded, 201, "Photo uploaded successfully");
  } catch (error) {
    return handleRouteError(error);
  }
}
