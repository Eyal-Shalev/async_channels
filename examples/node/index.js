import { Channel } from "@eyal-shalev/async-channels";

const ch = new Channel(0);

(async () => {
  await ch.send("hello");
  await ch.send("world");
})();

for await (const msg of ch) {
  console.log(msg);
}
