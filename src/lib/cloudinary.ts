import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "./api-response";

let isConfigured = false;

function ensureCloudinaryConfig() {
  if (isConfigured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    isConfigured = true;
  }
}

export interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
}

export async function uploadImageToCloudinary(
  buffer: Buffer,
  mimeType: string,
  subfolder = "proofs"
): Promise<UploadResult> {
  ensureCloudinaryConfig();

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const baseFolder = process.env.CLOUDINARY_FOLDER || "goodspend";

  if (
    !cloudName ||
    !apiKey ||
    !apiSecret ||
    cloudName === "your-cloudinary-cloud-name"
  ) {
    throw new ApiError(
      500,
      "Cloudinary credentials are not configured in .env",
      "CLOUDINARY_CONFIG_MISSING"
    );
  }

  const base64DataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;

  try {
    const result = await cloudinary.uploader.upload(base64DataUri, {
      folder: `${baseFolder}/${subfolder}`,
      resource_type: "image",
      transformation: [{ quality: "auto:good", fetch_format: "auto" }],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    };
  } catch (err) {
    console.error("[Cloudinary Upload Error]:", err);
    throw new ApiError(
      502,
      "Failed to upload image to Cloudinary",
      "IMAGE_UPLOAD_FAILED"
    );
  }
}
