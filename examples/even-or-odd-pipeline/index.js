import { Channel } from "https://cdn.skypack.dev/@eyalsh/async_channels@^1.0.0-beta4?dts";

const input = new Channel();

const evenOrOdd = ([x]) => {
  const n = parseInt(x);
  if (Number.isNaN(n) || x !== String(n)) return "notNumber";
  return n % 2 === 0 ? "even" : "odd";
};

const {
  even,
  odd,
  notNumber,
} = input.subscribe(evenOrOdd, ["even", "odd", "notNumber"]);

notNumber.forEach(([n, ackCh]) => {
  alert(`"${n}" is not a number`);
  ackCh.close();
});
even.forEach(([n, ackCh]) => {
  alert(`${n} is even`);
  ackCh.close();
});
odd.forEach(([n, ackCh]) => {
  alert(`${n} is odd`);
  ackCh.close();
});

while (true) {
  const num = prompt("number: ");
  if (num === null) break;
  const ackCh = new Channel();
  await input.send([num, ackCh]);
  await ackCh.get();
}
input.close();
alert("Goodbye");
