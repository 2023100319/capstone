import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

// Serves the UploadThing endpoints. Token is read from process.env.UPLOADTHING_TOKEN.
export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});
