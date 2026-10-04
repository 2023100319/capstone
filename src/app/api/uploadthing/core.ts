import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { currentUser } from "@/lib/guards";
import { can } from "@/lib/roles";

const f = createUploadthing();

/**
 * Upload routes. Only menu-managing staff (admin/owner/supervisor) may upload a
 * menu photo — the same capability that guards the menu server actions. Never
 * trust the client: the role is re-derived from the session inside .middleware.
 */
export const ourFileRouter = {
  menuImage: f(
    { image: { maxFileSize: "4MB", maxFileCount: 1 } },
    // The browser already learns the file's ufsUrl from its own upload response, so
    // it must not block on the server callback. Waiting is the default, and it keeps
    // the upload request open until UploadThing can call this server back — a
    // round-trip that never lands on a localhost dev server, which left the staff
    // upload spinner running forever.
    { awaitServerData: false }
  )
    .middleware(async () => {
      const user = await currentUser();
      if (!user || !can(user.role, "manageMenu")) {
        throw new UploadThingError("You do not have permission to upload images.");
      }
      return { userId: user.id };
    })
    .onUploadComplete(async () => {
      // Nothing to hand back — the client reads the URL off the upload itself.
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
