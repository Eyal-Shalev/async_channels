
export const sleep = (duration: number) => new Promise<void>(res => {
  setTimeout(()=>res(), duration);
});