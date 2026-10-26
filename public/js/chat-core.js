// The chat engine behind the Web Worker: reads the file, analyses it, then
// answers word searches and quiz requests. It also runs directly in the page
// for browsers that can't start a module worker.
import { demoChat } from "./demo.js";
import { quiz, searchChat } from "./explore.js";
import { parseChat } from "./parse.js";
import { analyzeAll } from "./stats.js";
import { extractChat, isZip } from "./zip.js";

const MAX_TEXT = 300 * 1024 * 1024;

export function createChatHandler(post) {
  const progress = (step) => post({ type: "progress", step });
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
      name = file.name ?? "";
      // Decide by content, not by file name: Android pickers and Drive often
      // hand over files without a .zip or .txt ending.
      if (await isZip(file)) {
        progress("Finding the chat inside the zip…");
        const entry = await extractChat(file).catch((e) => { e.stage = "zip"; throw e; });
        // iPhone zips hold `_chat.txt`; the zip's own name carries the chat title.
        if (!/(^|\/)_chat\.txt$/i.test(entry.name)) name = entry.name;
        text = new TextDecoder().decode(entry.bytes);
      } else {
        if (file.size > MAX_TEXT) throw new Error("That file is over 300 MB. Export the chat without media and try again.");
        if (/^(image|video|audio)\//.test(file.type)) throw new Error("That's a photo, video or audio file. In WhatsApp, use Export chat and upload the .txt or .zip it gives you.");
        progress("Opening the file…");
        text = await file.text();
      }
    }
    progress("Reading every message…");
    chat = parseChat(text, name);
    progress(`Crunching ${chat.messages.length.toLocaleString("en")} messages…`);
    post({ type: "done", result: analyzeAll(chat) });
  }

  return async (data) => {
    if (data.type === "search" || data.type === "quiz") {
      const messages = chat ? inPeriod(data.period) : [];
      const answer = data.type === "search" ? searchChat(messages, data.query) : quiz(messages, data.people, { seed: data.seed });
      post({ type: "answer", id: data.id, answer });
      return;
    }
    try {
      await load(data);
    } catch (e) {
      post({ type: "error", error: e?.message ?? String(e), stage: e?.stage ?? "parse" });
    }
  };
}
