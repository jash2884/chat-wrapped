// Parsing and analysis run off the main thread so 100k-message chats don't freeze the page.
// The worker then stays alive for the session to answer word searches and quiz
// requests, so message text never has to be copied to the page.
import { demoChat } from "./demo.js";
import { quiz, searchChat } from "./explore.js";
import { parseChat } from "./parse.js";
import { analyzeAll } from "./stats.js";
import { extractChat, isZip } from "./zip.js";

const MAX_TEXT = 300 * 1024 * 1024;
const progress = (step) => self.postMessage({ type: "progress", step });
let chat = null;

const inPeriod = (period) => (period && period !== "all"
  ? chat.messages.filter((m) => new Date(m.ts).getUTCFullYear() === Number(period))
  : chat.messages);

async function load(data) {
  let text, name = "";
  if (data.demo) {
    progress("Writing a year of fictional group chat…");
    text = demoChat();
  } else {
    const file = data.file;
    name = file.name;
    if (await isZip(file)) {
      progress("Finding the chat inside the zip…");
      const entry = await extractChat(file);
      // iPhone zips hold `_chat.txt`; the zip's own name carries the chat title.
      if (!/(^|\/)_chat\.txt$/i.test(entry.name)) name = entry.name;
      text = new TextDecoder().decode(entry.bytes);
    } else {
      if (file.size > MAX_TEXT) throw new Error("That file is over 300 MB. Export the chat without media and try again.");
      progress("Opening the file…");
      text = await file.text();
    }
  }
  progress("Reading every message…");
  chat = parseChat(text, name);
  progress(`Crunching ${chat.messages.length.toLocaleString("en")} messages…`);
  self.postMessage({ type: "done", result: analyzeAll(chat) });
}

self.onmessage = async ({ data }) => {
  if (data.type === "search" || data.type === "quiz") {
    const messages = chat ? inPeriod(data.period) : [];
    const answer = data.type === "search" ? searchChat(messages, data.query) : quiz(messages, data.people, { seed: data.seed });
    self.postMessage({ type: "answer", id: data.id, answer });
    return;
  }
  try {
    await load(data);
  } catch (e) {
    self.postMessage({ type: "error", error: e?.message ?? String(e) });
  }
};
