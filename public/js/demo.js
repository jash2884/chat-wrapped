// A deterministic, fictional group chat so anyone can try the app in one click.
// It is emitted as a real Android WhatsApp export and goes through the normal parser.

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE = {
  Maya: {
    weight: 1.4, reply: 4, hours: [23, 0, 1, 22, 13, 21],
    lines: ["omggg 😭😭", "i literally cannot sleep 🌙", "this is SO us 😂😂", "okay but hear me out ✨", "pizza tonight??? 🍕🍕", "love you guys 🫶", "WAIT what 😭", "screaming 😂", "who's up 👀", "i need a trip asap ✈️", "no because why is this so funny 😂", "brb crying 😭", "outfit check tomorrow 💅", "the vibes are immaculate ✨✨", "someone call me i'm bored 📞", "good night guys 🌙💕", "love you all ❤️❤️"],
  },
  Arjun: {
    weight: 1.25, reply: 1.2, hours: [9, 12, 18, 19, 21],
    lines: ["lol", "hahaha", "bro 😂", "on it", "same", "send it", "lmao", "who's driving", "i'm in", "bro what", "hahaha no way", "gym tomorrow 7am?", "i'll book the table", "done ✅", "lol classic", "match tonight anyone?", "bro watch this https://www.instagram.com/reel/C9xQ2mVt1aZ/ 😂", "https://youtu.be/dQw4w9WgXcQ classic", "this reel is us https://www.instagram.com/reel/C8kLp0aNq3e/"],
  },
  Zoe: {
    weight: 0.85, reply: 7, hours: [8, 10, 17, 19],
    lines: [
      "okay so I was thinking about the trip and honestly if we leave friday evening we can skip the traffic and still reach before midnight",
      "just finished the book I told you about, the ending was genuinely unexpected and I would recommend it to all of you",
      "can we please decide on the restaurant before thursday because last time we wasted an hour standing outside",
      "I made a shared list for the trip with the stuff everyone needs to bring, please check it when you get a chance",
      "good morning, reminder that the movie is at eight so let's meet at the coffee place by seven thirty",
      "honestly I think we should do a proper dinner for maya's birthday instead of the usual pizza",
      "the museum has free entry on sunday mornings if anyone wants to go before lunch",
      "I'm making pasta tonight and there is way too much of it so come over if you're free",
    ],
  },
  Leo: {
    weight: 0.5, reply: 55, hours: [10, 14, 17],
    lines: ["sorry just saw this", "yeah", "what did i miss", "can't today", "late reply but yes", "👍", "sounds good", "wait which day", "i'm in i think", "haha nice"],
  },
};

const SHARED = ["movie this weekend?", "coffee tomorrow?", "who's free saturday", "running 10 min late", "omw", "i'm outside", "send the photos", "exam prep is killing me", "did anyone see the match last night", "road trip when", "pizza or burgers", "okay final plan?", "trip budget?", "same place as last time?", "gym was brutal today"];
const BIRTHDAY = ["happy birthday maya!!! 🎂🎉", "HBD 🥳🥳🥳", "cake pics please 🎂", "best day ever 😭🫶", "who has the photos", "speech speech speech 🎤", "the cake was insane", "dance floor at 11 🕺", "happy birthday!! 🎉"];

function weighted(r, items, weight) {
  const total = items.reduce((s, x) => s + weight(x), 0);
  let x = r() * total;
  for (const it of items) if ((x -= weight(it)) < 0) return it;
  return items.at(-1);
}

const pad = (n) => String(n).padStart(2, "0");
function stamp(t) {
  const d = new Date(t);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function demoChat() {
  const r = rng(2026);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const names = Object.keys(PEOPLE);
  const start = Date.UTC(2026, 0, 1), end = Date.UTC(2026, 9, 25);
  const quiet = [Date.UTC(2026, 7, 3), Date.UTC(2026, 7, 13)]; // everyone travelling separately
  const birthday = Date.UTC(2026, 5, 13);
  const out = [];

  for (let day = start; day <= end; day += DAY) {
    if (day >= quiet[0] && day <= quiet[1]) continue;
    const dow = new Date(day).getUTCDay();
    const party = day === birthday;
    let convos = party ? 10 : Math.floor(r() * (dow === 0 || dow === 6 ? 4.5 : 3.2));
    if (!party && r() < 0.05) convos = 0;
    for (let c = 0; c < convos; c++) {
      let speaker = weighted(r, names, (n) => PEOPLE[n].weight * (n === "Leo" ? 0.4 : 1));
      let t = day + pick(PEOPLE[speaker].hours) * HOUR + Math.floor(r() * 60) * MIN;
      const length = 3 + Math.floor(r() * r() * (party ? 70 : 30));
      for (let k = 0; k < length; k++) {
        const roll = r();
        const text = roll < 0.04 ? "<Media omitted>"
          : roll < 0.045 ? "This message was deleted"
          : party && r() < 0.6 ? pick(BIRTHDAY)
          : k === 0 || r() < 0.25 ? pick(SHARED)
          : pick(PEOPLE[speaker].lines);
        const edited = speaker === "Zoe" && text.length > 60 && r() < 0.15 ? " <This message was edited>" : "";
        out.push([t, `${stamp(t)} - ${speaker}: ${text}${edited}`]);
        const next = r() < 0.18 ? speaker : weighted(r, names.filter((n) => n !== speaker), (n) => PEOPLE[n].weight);
        const gap = next === speaker ? 5_000 + r() * 50_000 : -Math.log(1 - r()) * PEOPLE[next].reply * MIN;
        t += Math.max(MIN, gap);
        speaker = next;
      }
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  return [
    "01/01/2026, 00:02 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.",
    '01/01/2026, 00:02 - Maya created group "The Group Chat 🍕"',
    ...out.map(([, line]) => line),
  ].join("\n");
}
