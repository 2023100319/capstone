import { generateReactHelpers } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

// Headless helper only — we render our own upload UI so the app doesn't need to
// ship UploadThing's prebuilt stylesheet (a Tailwind v3 build whose unlayered
// utilities would override this app's Tailwind v4 layered utilities).
export const { useUploadThing } = generateReactHelpers<OurFileRouter>();
