import { Channel } from "https://cdn.skypack.dev/@eyalsh/async_channels@^1.0.0-rc3?dts";

const sleep = (n) => new Promise((resolve) => setTimeout(resolve, n));

const myData =
  `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Diam vel quam elementum pulvinar etiam non quam. Pellentesque habitant morbi tristique senectus et netus et malesuada fames. Tempus egestas sed sed risus pretium quam vulputate dignissim suspendisse. Vitae ultricies leo integer malesuada nunc vel risus commodo. Fermentum dui faucibus in ornare quam viverra orci sagittis eu. Ac tortor vitae purus faucibus ornare suspendisse sed. Est pellentesque elit ullamcorper dignissim cras. Turpis tincidunt id aliquet risus feugiat. Nisl condimentum id venenatis a condimentum.
Mi eget mauris pharetra et ultrices. Pharetra vel turpis nunc eget. Lectus nulla at volutpat diam ut venenatis tellus. Nibh tellus molestie nunc non blandit. Id consectetur purus ut faucibus pulvinar elementum integer enim. Phasellus vestibulum lorem sed risus. Nulla porttitor massa id neque aliquam vestibulum morbi blandit cursus. Pretium lectus quam id leo in vitae turpis. Sed tempus urna et pharetra pharetra massa massa ultricies. Ut faucibus pulvinar elementum integer enim neque volutpat ac.
Est ullamcorper eget nulla facilisi etiam dignissim diam quis. Sed augue lacus viverra vitae congue. Ultrices gravida dictum fusce ut placerat orci. Facilisis leo vel fringilla est ullamcorper. Enim ut tellus elementum sagittis vitae et leo duis. Mattis aliquam faucibus purus in. Faucibus turpis in eu mi. Tempus quam pellentesque nec nam aliquam sem et tortor. Pharetra sit amet aliquam id diam maecenas ultricies mi eget. Condimentum lacinia quis vel eros donec. Scelerisque varius morbi enim nunc faucibus a pellentesque sit amet. Quis viverra nibh cras pulvinar mattis nunc sed blandit. Proin libero nunc consequat interdum varius sit amet. Dictum fusce ut placerat orci nulla pellentesque dignissim. Ut enim blandit volutpat maecenas volutpat blandit aliquam. Placerat vestibulum lectus mauris ultrices eros in. Accumsan in nisl nisi scelerisque eu ultrices vitae auctor eu. Bibendum arcu vitae elementum curabitur.
Amet est placerat in egestas. Quis imperdiet massa tincidunt nunc pulvinar sapien et. Morbi tristique senectus et netus et. Donec adipiscing tristique risus nec feugiat. Arcu odio ut sem nulla pharetra diam sit amet. Urna molestie at elementum eu facilisis sed. Lobortis scelerisque fermentum dui faucibus in ornare quam. Lectus quam id leo in vitae turpis massa. Tortor aliquam nulla facilisi cras fermentum. Neque aliquam vestibulum morbi blandit cursus risus. Sed id semper risus in hendrerit gravida rutrum quisque. In aliquam sem fringilla ut morbi. Semper quis lectus nulla at volutpat diam ut venenatis tellus.
Amet venenatis urna cursus eget nunc scelerisque viverra. Duis at tellus at urna. Auctor augue mauris augue neque gravida in fermentum et sollicitudin. Fusce ut placerat orci nulla pellentesque dignissim enim sit. Fermentum et sollicitudin ac orci phasellus egestas tellus rutrum. Eget felis eget nunc lobortis mattis aliquam faucibus purus in. Dictum fusce ut placerat orci nulla pellentesque dignissim. Vel risus commodo viverra maecenas accumsan. Malesuada nunc vel risus commodo viverra maecenas accumsan. Pellentesque pulvinar pellentesque habitant morbi tristique senectus et. Dictum at tempor commodo ullamcorper a lacus vestibulum. Iaculis at erat pellentesque adipiscing commodo elit at imperdiet. Ultrices vitae auctor eu augue ut lectus arcu. Amet purus gravida quis blandit turpis cursus in. Tristique sollicitudin nibh sit amet. Mauris sit amet massa vitae tortor condimentum lacinia quis vel. Augue eget arcu dictum varius duis at consectetur lorem donec.`;

const ch = new Channel(0);

const p = ch
  .flatMap(async (item) => {
    await sleep(1000 * Math.random());
    return item.split("\n");
  }, { bufferSize: 3 })
  .flatMap(async (item) => {
    await sleep(1000 * Math.random());
    return item.split(/[.,]/);
  }, { bufferSize: 6 })
  .map(async (item) => {
    await sleep(500 * Math.random());
    return item.trim();
  }, { bufferSize: 0 })
  .filter(async (item) => {
    await sleep(500 * Math.random());
    return item !== "";
  }, { bufferSize: 0 })
  .map(async (item) => {
    await sleep(500 * Math.random());
    return item.toLowerCase();
  }, { bufferSize: 2 })
  .forEach(async (item) => {
    await sleep(1000 * Math.random());
    console.log(item);
  }, { bufferSize: 4 })
  .get();

async function start() {
  await ch.send(myData);
  ch.close();
}

await start();
await p;
