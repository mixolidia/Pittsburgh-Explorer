import { db, dishPhotosTable } from "@workspace/db";
import {
  CreateDishBody,
  CreateDishResponse,
  GetDishImageParams,
  ListDishesResponse,
  type ApiError,
} from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp";

function errorPayload(error: string): ApiError {
  return { error };
}

function matchesImageType(
  bytes: Buffer,
  mimeType: SupportedMimeType,
): boolean {
  if (mimeType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  return (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

function serializeDishPhoto(photo: {
  id: number;
  title: string;
  caption: string;
  mimeType: string;
  inspectorNote: string | null;
  createdAt: Date;
}) {
  return {
    id: photo.id,
    title: photo.title,
    caption: photo.caption,
    mimeType: photo.mimeType,
    imageUrl: `/api/dishes/${photo.id}/image`,
    inspectorNote: photo.inspectorNote,
    createdAt: photo.createdAt,
  };
}

router.get("/dishes", async (req, res): Promise<void> => {
  try {
    const photos = await db
      .select({
        id: dishPhotosTable.id,
        title: dishPhotosTable.title,
        caption: dishPhotosTable.caption,
        mimeType: dishPhotosTable.mimeType,
        inspectorNote: dishPhotosTable.inspectorNote,
        createdAt: dishPhotosTable.createdAt,
      })
      .from(dishPhotosTable)
      .orderBy(desc(dishPhotosTable.createdAt), desc(dishPhotosTable.id));

    res.json(ListDishesResponse.parse(photos.map(serializeDishPhoto)));
  } catch (error) {
    req.log.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Could not list dish photos",
    );
    res.status(500).json(errorPayload("The dish gallery could not be loaded."));
  }
});

router.post("/dishes", async (req, res): Promise<void> => {
  const parsed = CreateDishBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      errorPayload("Add a title and a JPEG, PNG, or WebP photo."),
    );
    return;
  }

  const title = parsed.data.title.trim();
  if (!title) {
    res.status(400).json(errorPayload("Add a title for your dish photo."));
    return;
  }

  const dataUrlMatch = DATA_URL_PATTERN.exec(parsed.data.image);
  if (!dataUrlMatch) {
    res.status(400).json(
      errorPayload("Choose a JPEG, PNG, or WebP photo to upload."),
    );
    return;
  }

  const mimeType = dataUrlMatch[1] as SupportedMimeType;
  const imageBase64 = dataUrlMatch[2];
  if (imageBase64.length % 4 !== 0) {
    res.status(400).json(errorPayload("The selected image data is invalid."));
    return;
  }

  const imageBytes = Buffer.from(imageBase64, "base64");
  if (imageBytes.length === 0 || imageBytes.toString("base64") !== imageBase64) {
    res.status(400).json(errorPayload("The selected image data is invalid."));
    return;
  }

  if (imageBytes.length > MAX_IMAGE_BYTES) {
    res.status(400).json(
      errorPayload("Photo is too large. Choose an image no larger than 3 MB."),
    );
    return;
  }

  if (!matchesImageType(imageBytes, mimeType)) {
    res.status(400).json(
      errorPayload("The photo contents do not match its image type."),
    );
    return;
  }

  try {
    const [photo] = await db
      .insert(dishPhotosTable)
      .values({
        title,
        caption: parsed.data.caption?.trim() ?? "",
        mimeType,
        imageBase64,
      })
      .returning({
        id: dishPhotosTable.id,
        title: dishPhotosTable.title,
        caption: dishPhotosTable.caption,
        mimeType: dishPhotosTable.mimeType,
        inspectorNote: dishPhotosTable.inspectorNote,
        createdAt: dishPhotosTable.createdAt,
      });

    res.status(201).json(CreateDishResponse.parse(serializeDishPhoto(photo)));
  } catch (error) {
    req.log.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Could not save dish photo",
    );
    res.status(500).json(errorPayload("The dish photo could not be saved."));
  }
});

router.get("/dishes/:id/image", async (req, res): Promise<void> => {
  const params = GetDishImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json(errorPayload("Dish photo not found."));
    return;
  }

  try {
    const [photo] = await db
      .select({
        mimeType: dishPhotosTable.mimeType,
        imageBase64: dishPhotosTable.imageBase64,
      })
      .from(dishPhotosTable)
      .where(eq(dishPhotosTable.id, params.data.id));

    if (!photo) {
      res.status(404).json(errorPayload("Dish photo not found."));
      return;
    }

    res
      .status(200)
      .set("Content-Type", photo.mimeType)
      .send(Buffer.from(photo.imageBase64, "base64"));
  } catch (error) {
    req.log.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Could not load dish photo image",
    );
    res.status(500).json(errorPayload("The dish photo could not be loaded."));
  }
});

export default router;
