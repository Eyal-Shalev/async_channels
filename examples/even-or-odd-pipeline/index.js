import {
  BroadcastChannel,
  Channel,
} from "https://cdn.skypack.dev/@eyalsh/async_channels@^v1.0.0-alpha45";

const input = new Channel();

const bcast = BroadcastChannel.from(input, ([x]) => {
  const n = parseInt(x);
  if (Number.isNaN(n)) return "not-number";
  return n % 2 === 0 ? "even" : "odd";
});
bcast.subscribe("not-number").forEach(([n, ackCh]) => {
  alert(`"${n}" is not a number`);
  ackCh.close();
});
bcast.subscribe("even").forEach(([n, ackCh]) => {
  alert(`${n} is even`);
  ackCh.close();
});
bcast.subscribe("odd").forEach(([n, ackCh]) => {
  alert(`${n} is odd`);
  ackCh.close();
});

while (true) {
  const num = prompt("number: ");
  if (num === null) break;
  const ackCh = new Channel();
  await input.send([num, ackCh]);
  await ackCh.receive();
}
input.close();
alert("Goodbye");
