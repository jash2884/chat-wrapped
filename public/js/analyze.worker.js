// Parsing and analysis run off the main thread so 100k-message chats don't freeze the page.
// The worker stays alive for the session to answer word searches and quiz requests.
import { createChatHandler } from "./chat-core.js";

const handle = createChatHandler((message) => self.postMessage(message));
self.onmessage = ({ data }) => handle(data);
