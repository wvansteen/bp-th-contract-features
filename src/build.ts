// Build-only entrypoint: emits static assets, never imported by the server.
import indexHtml from "../public/index.html" with { type: "file" };
import stylesheet from "../public/lake-county.css" with { type: "file" };
import deepChatBundle from "deep-chat/dist/deepChat.bundle.js" with { type: "file" };

export { deepChatBundle, indexHtml, stylesheet };
