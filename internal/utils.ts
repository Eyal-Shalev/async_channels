export const sleep = (duration: number) => {
  return new Promise<void>((res) => {
    setTimeout(() => res(), duration);
  });
};
